#!/usr/bin/env node
// Throwaway verification (not part of the product) exercising the
// secondary API surface + webhook delivery against the live local stack:
// GET /jobs, GET /jobs/:id/download (json), DELETE /jobs/:id, invalid-file
// rejection, and webhook HMAC delivery via a temporary local listener.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = 'http://localhost:3000';
const apiKey = 'dev-local-key';
const auth = { Authorization: `Bearer ${apiKey}` };
let failures = 0;

function check(name, cond) {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}`);
  if (!cond) failures++;
}

// --- 1. Invalid file rejection ---
{
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('not a zip at all')], { type: 'application/epub+zip' }), 'bad.epub');
  const res = await fetch(`${baseUrl}/api/v1/convert`, { method: 'POST', headers: auth, body: form });
  const body = await res.json();
  check('non-zip upload rejected with 415 UNSUPPORTED_MEDIA_TYPE', res.status === 415 && body.error_code === 'UNSUPPORTED_MEDIA_TYPE');
}

// --- 2. Webhook delivery (submit with callback_url pointing at a local listener) ---
let received = null;
const webhookServer = createServer((req, res) => {
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received = { headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
    res.writeHead(200);
    res.end('ok');
  });
});
await new Promise((resolve) => webhookServer.listen(4321, resolve));

const epubBytes = await readFile(path.join(__dirname, '..', 'fixtures', 'sample.epub'));
const form2 = new FormData();
form2.append('file', new Blob([epubBytes], { type: 'application/epub+zip' }), 'sample.epub');
form2.append('callback_url', 'http://localhost:4321/webhook');
const convertRes = await fetch(`${baseUrl}/api/v1/convert`, { method: 'POST', headers: auth, body: form2 });
const { job_id: jobId } = await convertRes.json();
check('second job created for webhook test', convertRes.status === 201 && Boolean(jobId));

let job;
const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const r = await fetch(`${baseUrl}/api/v1/status/${jobId}`, { headers: auth });
  job = await r.json();
  if (job.status === 'completed' || job.status === 'failed') break;
  await new Promise((r2) => setTimeout(r2, 1500));
}
check('webhook job completed', job?.status === 'completed');

await new Promise((r) => setTimeout(r, 1500)); // let the webhook worker fire
check('webhook was received', Boolean(received));
if (received) {
  const sigHeader = received.headers['x-hub-signature'];
  // We don't know the per-job secret from here (it's server-side only), so
  // just confirm the header is well-formed; job-level HMAC correctness is
  // covered by packages/shared/tests/hmac.test.js using the same function.
  check('X-Hub-Signature header present and well-formed', /^sha256=[0-9a-f]{64}$/.test(sigHeader || ''));
  const parsed = JSON.parse(received.body);
  check('webhook payload has matching job_id', parsed.job_id === jobId);
  check('webhook payload reports completed status', parsed.status === 'completed');
}
webhookServer.close();

// --- 3. GET /jobs lists at least our two jobs ---
{
  const res = await fetch(`${baseUrl}/api/v1/jobs?page_size=50`, { headers: auth });
  const body = await res.json();
  check('GET /jobs returns 200 with a jobs array', res.status === 200 && Array.isArray(body.jobs) && body.jobs.length >= 2);
}

// --- 4. GET /jobs/:id/download (json) ---
{
  const res = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/download`, { headers: { ...auth, Accept: 'application/json' } });
  const body = await res.json();
  check('GET /jobs/:id/download (json) returns a download_url', res.status === 200 && typeof body.download_url === 'string');
}

// --- 5. DELETE /jobs/:id then confirm 404 ---
{
  const del = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, { method: 'DELETE', headers: auth });
  check('DELETE /jobs/:id returns 204', del.status === 204);
  const after = await fetch(`${baseUrl}/api/v1/status/${jobId}`, { headers: auth });
  check('GET /status after delete returns 404', after.status === 404);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
