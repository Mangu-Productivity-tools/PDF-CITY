#!/usr/bin/env node
// Real end-to-end smoke test: POSTs fixtures/sample.epub to a running API
// (POST /convert), polls GET /status/{job_id} until the worker (consuming
// from the real BullMQ/Redis queue) finishes it, then downloads the signed
// URL and checks the result is a plausible PDF. Exercises the same code
// path a production client would use.
//
// Usage: API_BASE_URL=http://localhost:3000 API_KEY=dev-local-key node scripts/smoke-test.js

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
const apiKey = process.env.API_KEY || 'dev-local-key';
const epubPath = process.env.SMOKE_EPUB || path.join(__dirname, '..', 'fixtures', 'sample.epub');

function log(...args) {
  console.log('[smoke-test]', ...args);
}

async function main() {
  const epubBytes = await readFile(epubPath);
  log(`submitting ${epubPath} (${epubBytes.length} bytes) to ${baseUrl}/api/v1/convert`);

  const form = new FormData();
  form.append('file', new Blob([epubBytes], { type: 'application/epub+zip' }), 'sample.epub');
  form.append('options', JSON.stringify({ engine: 'chrome', page_size: 'A4' }));

  const convertRes = await fetch(`${baseUrl}/api/v1/convert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (convertRes.status !== 201) {
    throw new Error(`POST /convert expected 201, got ${convertRes.status}: ${await convertRes.text()}`);
  }
  const { job_id: jobId, status_url: statusUrl } = await convertRes.json();
  log(`job created: ${jobId} (status_url=${statusUrl})`);

  const deadline = Date.now() + 120_000;
  let job;
  while (Date.now() < deadline) {
    const statusRes = await fetch(`${baseUrl}/api/v1/status/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (statusRes.status !== 200) {
      throw new Error(`GET /status expected 200, got ${statusRes.status}: ${await statusRes.text()}`);
    }
    job = await statusRes.json();
    log(`status=${job.status} progress=${job.progress}`);
    if (job.status === 'completed' || job.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!job || job.status !== 'completed') {
    throw new Error(`Job did not complete in time. Last state: ${JSON.stringify(job)}`);
  }
  if (!job.download_url) {
    throw new Error('Job completed but no download_url was returned.');
  }

  log(`job completed: engine=${job.metadata?.engine} page_count=${job.metadata?.page_count} title="${job.metadata?.title}"`);
  log(`downloading ${job.download_url}`);

  const pdfRes = await fetch(job.download_url);
  if (pdfRes.status !== 200) {
    throw new Error(`Download expected 200, got ${pdfRes.status}`);
  }
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  const header = pdfBytes.subarray(0, 5).toString('latin1');

  log(`downloaded ${pdfBytes.length} bytes, header="${header}"`);
  if (header !== '%PDF-' || pdfBytes.length < 500) {
    throw new Error('Downloaded file does not look like a valid PDF.');
  }

  log('PASS - full pipeline (API -> queue -> worker -> engines -> storage -> signed download) verified.');
}

main().catch((err) => {
  console.error('[smoke-test] FAIL:', err.message);
  process.exitCode = 1;
});
