import AdmZip from 'adm-zip';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WorkerError } from '../lib/errors.js';

/**
 * Unzip an EPUB (which is just a zip archive) into destDir.
 * Spec: "Download & unzip EPUB in a dedicated job-specific temp dir."
 */
export function extractEpub(epubPath, destDir) {
  let zip;
  try {
    zip = new AdmZip(epubPath);
  } catch (err) {
    throw new WorkerError('INVALID_EPUB', `Not a valid zip archive: ${err.message}`);
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new WorkerError('INVALID_EPUB', 'EPUB archive is empty.');
  }

  try {
    zip.extractAllTo(destDir, true);
  } catch (err) {
    throw new WorkerError('UNZIP_FAILED', err.message);
  }

  const mimetypePath = path.join(destDir, 'mimetype');
  const containerPath = path.join(destDir, 'META-INF', 'container.xml');
  if (!existsSync(containerPath)) {
    throw new WorkerError('INVALID_EPUB', 'Missing META-INF/container.xml - not a valid EPUB.');
  }
  if (!existsSync(mimetypePath)) {
    // Not fatal for a lot of real-world EPUBs (some tools omit it), just log via caller.
  }

  return { entryCount: entries.length };
}
