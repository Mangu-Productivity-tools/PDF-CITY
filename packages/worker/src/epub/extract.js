import AdmZip from 'adm-zip';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WorkerError } from '../lib/errors.js';

function hasEpubMagicBytes(filePath) {
  try {
    const header = readFileSync(filePath, { flag: 'r' }).subarray(0, 4);
    // ZIP local-file-header magic "PK\x03\x04", or empty-archive "PK\x05\x06"
    return header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b &&
      (header[2] === 0x03 || header[2] === 0x05);
  } catch {
    return false;
  }
}

/**
 * Unzip an EPUB (which is just a zip archive) into destDir.
 * Spec: "Download & unzip EPUB in a dedicated job-specific temp dir."
 */
export function extractEpub(epubPath, destDir) {
  if (!hasEpubMagicBytes(epubPath)) {
    throw new WorkerError('INVALID_EPUB', 'File does not have a valid EPUB/ZIP header (PK magic bytes missing).');
  }

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
