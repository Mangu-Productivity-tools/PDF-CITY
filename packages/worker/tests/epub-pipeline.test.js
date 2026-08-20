import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEpub } from '../src/epub/extract.js';
import { parseContainer, detectDrm } from '../src/epub/container.js';
import { parseOpf } from '../src/epub/opf.js';
import { assembleHtml } from '../src/epub/assemble.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '..', '..', '..', 'fixtures', 'sample.epub');

test('full extract -> parse -> assemble pipeline on the sample fixture', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'worker-test-'));
  try {
    const { entryCount } = extractEpub(fixture, tempDir);
    assert.ok(entryCount > 0);
    assert.equal(detectDrm(tempDir), false);

    const opfRelPath = parseContainer(tempDir);
    assert.equal(opfRelPath, 'OEBPS/content.opf');

    const parsed = parseOpf(tempDir, opfRelPath);
    assert.equal(parsed.title, 'Sample Fixture Book');
    assert.equal(parsed.creator, 'Mangu Publishers QA');
    assert.equal(parsed.spine.length, 2);
    assert.equal(parsed.coverItem?.href, 'images/cover.png');

    const { htmlPath, chapterCount } = assembleHtml(parsed);
    assert.equal(chapterCount, 2);

    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(!html.includes('<script>'), 'script tags must be stripped');
    assert.ok(!html.includes('onclick'), 'event handler attributes must be stripped');
    assert.ok(!html.includes('<iframe'), 'iframes must be stripped');
    assert.ok(html.includes('<svg'), 'svg should be preserved');
    assert.ok(html.includes('<table'), 'table should be preserved');
    assert.ok(html.includes('Chapter 1: The Beginning'));
    assert.ok(html.includes('Chapter 2: The Middle'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parseContainer throws INVALID_EPUB when container.xml is missing', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'worker-test-nocontainer-'));
  try {
    assert.throws(
      () => parseContainer(tempDir),
      (err) => ['INVALID_EPUB', 'PARSE_FAILED'].includes(err.code),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('detectDrm returns true when META-INF/encryption.xml is present', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'worker-test-drm-'));
  try {
    extractEpub(fixture, tempDir);
    mkdirSync(path.join(tempDir, 'META-INF'), { recursive: true });
    writeFileSync(path.join(tempDir, 'META-INF', 'encryption.xml'), '<encryption/>');
    assert.equal(detectDrm(tempDir), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('extractEpub rejects a non-zip file as INVALID_EPUB', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'worker-test-badzip-'));
  const fakeEpub = path.join(tempDir, 'fake.epub');
  writeFileSync(fakeEpub, 'this is not a zip file');
  try {
    assert.throws(() => extractEpub(fakeEpub, tempDir), (err) => err.code === 'INVALID_EPUB');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
