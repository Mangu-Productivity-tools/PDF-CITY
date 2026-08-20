import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SIGNED_URL_EXPIRY_SECONDS } from './constants.js';

/**
 * Thin S3-compatible storage wrapper shared by the API (signed download
 * URLs, delete-on-cancel) and the worker (upload the rendered PDF).
 * Works against real AWS S3 or a MinIO endpoint (S3_ENDPOINT + path-style).
 */
export function createStorageClient(env = process.env) {
  const bucket = env.S3_BUCKET_NAME;
  if (!bucket) throw new Error('S3_BUCKET_NAME is required');

  const client = new S3Client({
    region: env.S3_REGION || 'us-east-1',
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true' || Boolean(env.S3_ENDPOINT),
    credentials: env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  return {
    bucket,

    /** Upload a local file (Buffer/stream) as `key`, SSE-encrypted, private ACL. */
    async putObject(key, body, { contentType, metadata } = {}) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType || 'application/octet-stream',
          ServerSideEncryption: 'AES256',
          Metadata: metadata,
        }),
      );
      return { bucket, key };
    },

    /** Signed GET URL, default expiry from SIGNED_URL_EXPIRY_SECONDS (24h). */
    async getSignedDownloadUrl(key, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    /** Clean up incomplete multipart uploads on failure (spec: S3 Upload & Storage). */
    async abortStaleMultipartUploads() {
      const { Uploads = [] } = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
      await Promise.all(
        Uploads.map((u) =>
          client.send(
            new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }),
          ),
        ),
      );
      return Uploads.length;
    },

    raw: client,
  };
}
