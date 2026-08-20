import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import { WorkerError } from '../lib/errors.js';

const URL_ATTR_SELECTORS = [
  ['img', 'src'],
  ['image', 'href'],
  ['image', 'xlink:href'],
  ['source', 'src'],
  ['input', 'src'],
  ['use', 'href'],
  ['use', 'xlink:href'],
];

function isRewritable(url) {
  return url && !/^(data:|https?:|mailto:|#)/i.test(url);
}

/** Resolve `url` (as referenced from a file living in `fromDir`) into a path relative to `toDir`. */
function rewriteRelative(fromDir, url, toDir) {
  try {
    const clean = url.split('#')[0];
    if (!clean) return url;
    const abs = path.resolve(fromDir, decodeURIComponent(clean));
    return path.relative(toDir, abs).split(path.sep).join('/');
  } catch {
    return url;
  }
}

function rewriteCssUrls(css, fromDir, toDir) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
    if (!isRewritable(url)) return match;
    return `url(${quote}${rewriteRelative(fromDir, url, toDir)}${quote})`;
  });
}

/**
 * Read each spine document in order, rewrite its relative asset URLs to be
 * relative to the OPF base directory, inline its stylesheets, concatenate
 * the bodies with page-break markers between chapters, sanitize, and write
 * the result as a single HTML file inside opfDir (so relative asset paths
 * resolve naturally when the renderer loads it via file://).
 */
export function assembleHtml({ opfDir, manifest, spine, title }) {
  const inlinedCss = [];
  const seenStylesheets = new Set();
  const sections = [];

  for (const { idref, linear } of spine) {
    if (!linear) continue;
    const item = manifest.get(idref);
    if (!item?.href) continue;

    const filePath = path.join(opfDir, decodeURIComponent(item.href));
    if (!existsSync(filePath)) {
      // Missing spine file: skip rather than fail the whole book.
      continue;
    }
    const fileDir = path.dirname(filePath);

    let raw;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new WorkerError('PARSE_FAILED', `Could not read spine file ${item.href}: ${err.message}`);
    }

    const $ = cheerio.load(raw, { xmlMode: false });

    // Inline <link rel="stylesheet"> once per unique file.
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const cssAbsPath = path.resolve(fileDir, decodeURIComponent(href));
      if (!seenStylesheets.has(cssAbsPath) && existsSync(cssAbsPath)) {
        seenStylesheets.add(cssAbsPath);
        const cssRaw = readFileSync(cssAbsPath, 'utf8');
        inlinedCss.push(rewriteCssUrls(cssRaw, path.dirname(cssAbsPath), opfDir));
      }
      $(el).remove();
    });

    // Rewrite element URL attributes relative to the OPF base dir.
    for (const [tag, attr] of URL_ATTR_SELECTORS) {
      $(tag).each((_, el) => {
        const val = $(el).attr(attr);
        if (isRewritable(val)) {
          $(el).attr(attr, rewriteRelative(fileDir, val, opfDir));
        }
      });
    }

    // Rewrite inline style="...url(...)..." and <style> blocks.
    $('[style]').each((_, el) => {
      $(el).attr('style', rewriteCssUrls($(el).attr('style'), fileDir, opfDir));
    });
    $('style').each((_, el) => {
      $(el).text(rewriteCssUrls($(el).text(), fileDir, opfDir));
    });

    const bodyHtml = $('body').html() || '';
    sections.push(`<section class="epub-chapter" data-source="${item.href}">${bodyHtml}</section>`);
  }

  if (sections.length === 0) {
    throw new WorkerError('PARSE_FAILED', 'No renderable spine documents were found.');
  }

  const sanitizedBody = sanitizeHtml(sections.join('\n'), {
    allowedTags: [
      'section', 'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'a', 'em', 'strong', 'b', 'i', 'u', 's', 'sup', 'sub', 'small', 'mark',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
      'img', 'figure', 'figcaption', 'picture', 'source',
      'blockquote', 'pre', 'code', 'q', 'cite',
      'nav', 'header', 'footer', 'article', 'aside', 'main',
      'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'defs', 'title',
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'title', 'lang', 'dir', 'data-source'],
      a: ['href', 'name'],
      img: ['src', 'alt', 'width', 'height'],
      source: ['src', 'srcset', 'type'],
      svg: ['viewBox', 'xmlns', 'width', 'height', 'preserveAspectRatio'],
      use: ['href', 'xlink:href'],
      path: ['d', 'fill', 'stroke'],
      table: ['border', 'cellpadding', 'cellspacing'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowVulnerableTags: false,
    disallowedTagsMode: 'discard',
  });

  const escapedTitle = String(title || 'Untitled').replace(/[<>&]/g, '');
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapedTitle}</title>
<style>
${inlinedCss.join('\n')}
</style>
<style>
  .epub-chapter { break-before: page; }
  .epub-chapter:first-of-type { break-before: avoid; }
  img, svg { max-width: 100%; height: auto; }
  body { font-family: Georgia, 'Times New Roman', serif; }
</style>
</head>
<body>
${sanitizedBody}
</body>
</html>
`;

  const htmlPath = path.join(opfDir, '__combined__.html');
  writeFileSync(htmlPath, html, 'utf8');
  return { htmlPath, chapterCount: sections.length };
}
