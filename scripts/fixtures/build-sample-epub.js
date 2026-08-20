#!/usr/bin/env node
// Builds fixtures/sample.epub: a small, self-contained EPUB3 used by the
// worker's unit tests and the end-to-end smoke test. Deliberately includes
// a <script> tag, an onclick handler, and an <iframe> in chapter 1 so the
// smoke test can assert the sanitizer actually strips them.

import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '..', 'fixtures');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sample.epub');

const COVER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:sample-epub2pdf-fixture-0001</dc:identifier>
    <dc:title>Sample Fixture Book</dc:title>
    <dc:creator>Mangu Publishers QA</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-08-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="text/chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
    <item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`;

const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <ol>
      <li><a href="text/chapter1.xhtml">Chapter 1</a></li>
      <li><a href="text/chapter2.xhtml">Chapter 2</a></li>
    </ol>
  </nav>
</body>
</html>
`;

const chapter1 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Chapter 1</title>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
</head>
<body>
  <h1>Chapter 1: The Beginning</h1>
  <p>This is a <strong>sample</strong> paragraph used to verify that the EPUB-to-PDF
  pipeline correctly extracts, sanitizes, and renders content end to end.</p>
  <img src="../images/cover.png" alt="cover"/>
  <div onclick="alert('should be stripped')">This div has an inline event handler that sanitization must remove.</div>
  <script>alert('this script tag must be stripped by sanitization');</script>
  <iframe src="https://example.com">this iframe must be stripped by sanitization</iframe>
</body>
</html>
`;

const chapter2 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Chapter 2</title>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
</head>
<body>
  <h1>Chapter 2: The Middle</h1>
  <p>A second chapter, to confirm the page-break-between-chapters rule works
  and that multiple spine documents get concatenated in spine order.</p>
  <svg viewBox="0 0 100 20" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="100" height="20" fill="#ddd"/>
    <text x="5" y="14">inline svg</text>
  </svg>
  <table>
    <thead><tr><th>Col A</th><th>Col B</th></tr></thead>
    <tbody><tr><td>1</td><td>2</td></tr></tbody>
  </table>
</body>
</html>
`;

const styleCss = `body { font-family: Georgia, serif; }
h1 { color: #222; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
table { border-collapse: collapse; }
td, th { border: 1px solid #999; padding: 4px 8px; }
`;

const zip = new AdmZip();
zip.addFile('mimetype', Buffer.from('application/epub+zip', 'utf8'));
zip.addFile('META-INF/container.xml', Buffer.from(containerXml, 'utf8'));
zip.addFile('OEBPS/content.opf', Buffer.from(contentOpf, 'utf8'));
zip.addFile('OEBPS/nav.xhtml', Buffer.from(navXhtml, 'utf8'));
zip.addFile('OEBPS/text/chapter1.xhtml', Buffer.from(chapter1, 'utf8'));
zip.addFile('OEBPS/text/chapter2.xhtml', Buffer.from(chapter2, 'utf8'));
zip.addFile('OEBPS/styles/style.css', Buffer.from(styleCss, 'utf8'));
zip.addFile('OEBPS/images/cover.png', Buffer.from(COVER_PNG_BASE64, 'base64'));
zip.writeZip(outPath);

console.log(`[fixtures] wrote ${outPath}`);
