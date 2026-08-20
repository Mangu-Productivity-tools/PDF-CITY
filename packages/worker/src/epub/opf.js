import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { WorkerError } from '../lib/errors.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function textOf(node) {
  if (node == null) return undefined;
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && '#text' in node) return node['#text'];
  return undefined;
}

/**
 * Parse the OPF package document: manifest, spine (reading order), and
 * dc:title/creator/identifier metadata.
 */
export function parseOpf(destDir, opfRelPath) {
  const opfPath = path.join(destDir, opfRelPath);
  if (!existsSync(opfPath)) {
    throw new WorkerError('PARSE_FAILED', `OPF rootfile not found at ${opfRelPath}.`);
  }
  const opfDir = path.dirname(opfPath);

  let xml;
  try {
    xml = parser.parse(readFileSync(opfPath, 'utf8'));
  } catch (err) {
    throw new WorkerError('PARSE_FAILED', `Could not parse OPF: ${err.message}`);
  }

  const pkg = xml.package;
  if (!pkg) throw new WorkerError('PARSE_FAILED', 'OPF is missing <package> root element.');

  const metadata = pkg.metadata || {};
  const title = textOf(asArray(metadata['dc:title'])[0]) || 'Untitled';
  const creator = textOf(asArray(metadata['dc:creator'])[0]) || undefined;
  const identifier = textOf(asArray(metadata['dc:identifier'])[0]) || undefined;

  const manifestItems = asArray(pkg.manifest?.item);
  if (manifestItems.length === 0) {
    throw new WorkerError('PARSE_FAILED', 'OPF manifest has no items.');
  }

  const manifest = new Map();
  for (const item of manifestItems) {
    const id = item['@_id'];
    if (!id) continue;
    manifest.set(id, {
      id,
      href: item['@_href'],
      mediaType: item['@_media-type'],
      properties: item['@_properties'],
    });
  }

  const spineItems = asArray(pkg.spine?.itemref);
  if (spineItems.length === 0) {
    throw new WorkerError('PARSE_FAILED', 'OPF spine has no itemref entries.');
  }
  const spine = spineItems
    .map((ref) => ({ idref: ref['@_idref'], linear: ref['@_linear'] !== 'no' }))
    .filter((s) => manifest.has(s.idref));

  if (spine.length === 0) {
    throw new WorkerError('PARSE_FAILED', 'None of the spine itemrefs resolve to a manifest item.');
  }

  // Cover: EPUB3 manifest item with properties="cover-image", else EPUB2 <meta name="cover" content="ID">.
  let coverItem = [...manifest.values()].find((i) => (i.properties || '').includes('cover-image'));
  if (!coverItem) {
    const coverMeta = asArray(metadata.meta).find((m) => m['@_name'] === 'cover');
    if (coverMeta?.['@_content']) coverItem = manifest.get(coverMeta['@_content']);
  }

  return { opfPath, opfDir, title, creator, identifier, manifest, spine, coverItem: coverItem || null };
}
