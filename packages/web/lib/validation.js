import { MAX_EPUB_SIZE_MB, MIN_MARGIN_IN, MAX_MARGIN_IN } from './constants';

// Client-side pre-checks only, for fast feedback — the API remains the
// source of truth (it sniffs the ZIP magic bytes rather than trusting MIME
// type, see packages/api/src/routes/convert.js).
export function validateEpubFile(file) {
  if (!file) return 'Choose an EPUB file.';
  const name = file.name || '';
  const hasEpubExtension = name.toLowerCase().endsWith('.epub');
  const mimeIsPlausible =
    !file.type || file.type === 'application/epub+zip' || file.type === 'application/octet-stream' || file.type === 'application/zip';

  if (!hasEpubExtension || !mimeIsPlausible) return 'Only .epub files are supported.';
  if (file.size === 0) return 'That file is empty.';

  const maxBytes = MAX_EPUB_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) return `File is too large (max ${MAX_EPUB_SIZE_MB} MB).`;

  return null;
}

export function validateFileUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'Enter a file URL.';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Enter a valid URL.';
  }
  if (parsed.protocol !== 'https:') return 'The file URL must start with https://.';
  return null;
}

export function validateMarginValue(value) {
  if (value === '' || value === null || value === undefined) return 'Enter a number.';
  const num = Number(value);
  if (Number.isNaN(num)) return 'Enter a number.';
  if (num < MIN_MARGIN_IN || num > MAX_MARGIN_IN) return `Must be between ${MIN_MARGIN_IN} and ${MAX_MARGIN_IN} inches.`;
  return null;
}
