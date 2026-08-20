import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { WorkerError } from '../lib/errors.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/**
 * Parse META-INF/container.xml and return the path to the OPF "rootfile",
 * relative to the EPUB root. Handles multiple rootfiles by preferring the
 * one with EPUB3's media-type, per spec ("priority EPUB3 if present").
 */
export function parseContainer(destDir) {
  const containerPath = path.join(destDir, 'META-INF', 'container.xml');
  if (!existsSync(containerPath)) {
    throw new WorkerError('INVALID_EPUB', 'Missing META-INF/container.xml.');
  }

  let xml;
  try {
    xml = parser.parse(readFileSync(containerPath, 'utf8'));
  } catch (err) {
    throw new WorkerError('PARSE_FAILED', `Could not parse container.xml: ${err.message}`);
  }

  const rootfiles = xml?.container?.rootfiles?.rootfile;
  const list = Array.isArray(rootfiles) ? rootfiles : [rootfiles].filter(Boolean);
  if (list.length === 0) {
    throw new WorkerError('PARSE_FAILED', 'container.xml has no <rootfile> entries.');
  }

  const epub3 = list.find((r) => r['@_media-type'] === 'application/oebps-package+xml' && r['@_full-path']);
  const chosen = epub3 || list[0];
  const fullPath = chosen['@_full-path'];
  if (!fullPath) {
    throw new WorkerError('PARSE_FAILED', 'rootfile is missing full-path attribute.');
  }
  return fullPath;
}

/** DRM detection: spec says reject DRM-protected EPUBs with DRM_NOT_SUPPORTED. */
export function detectDrm(destDir) {
  return existsSync(path.join(destDir, 'META-INF', 'encryption.xml'));
}
