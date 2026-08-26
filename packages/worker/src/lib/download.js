import { writeFile } from 'node:fs/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createStorageClient, LIMITS } from '@epub2pdf/shared';
import { WorkerError } from './errors.js';
import { fetchPublicHttpsUrl } from './ssrfGuard.js';

const MAX_BYTES = LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Fetch the source EPUB referenced by a job's file_url, which is either a
 * public https:// URL, or an internal `s3://bucket/key` reference written by
 * the API for direct multipart uploads. Writes it to `destPath`.
 */
export async function downloadSource(fileUrl, destPath) {
  if (fileUrl.startsWith('s3://')) {
    const [, , bucket, ...keyParts] = fileUrl.split('/');
    const key = keyParts.join('/');
    const storage = createStorageClient();
    if (bucket !== storage.bucket) {
      throw new WorkerError('DOWNLOAD_FAILED', `Unexpected bucket in internal reference: ${bucket}`);
    }
    const obj = await storage.raw.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body.transformToByteArray();
    await writeFile(destPath, Buffer.from(bytes));
    return;
  }

  if (!fileUrl.startsWith('https://')) {
    throw new WorkerError('INVALID_URL', 'file_url must be https:// or an internal s3:// reference');
  }

  // Validates the host (and every redirect hop) resolves only to a public
  // address before fetching - see ssrfGuard.js for what this does and does
  // not protect against.
  const response = await fetchPublicHttpsUrl(fileUrl);

  // Reject oversized files early via Content-Length, and enforce the limit
  // again while buffering to guard against servers that omit the header.
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BYTES) {
    throw new WorkerError(
      'PAYLOAD_TOO_LARGE',
      `file_url content-length (${(contentLength / 1024 / 1024).toFixed(1)} MB) exceeds the ${LIMITS.MAX_FILE_SIZE_MB} MB limit.`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    throw new WorkerError(
      'PAYLOAD_TOO_LARGE',
      `Downloaded file (${(bytes.length / 1024 / 1024).toFixed(1)} MB) exceeds the ${LIMITS.MAX_FILE_SIZE_MB} MB limit.`,
    );
  }
  await writeFile(destPath, bytes);
}
