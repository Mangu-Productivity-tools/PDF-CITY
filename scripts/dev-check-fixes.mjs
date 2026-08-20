#!/usr/bin/env node
// Throwaway verification (not part of the product) for the three fixes made
// after the initial build: webhook-on-cancel, SSRF guard, and the two
// previously-dead API metrics now being incremented.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = 'http://localhost:3000';
const apiKey = 'dev-local-key';
const auth = { Authorization: `Bearer ${apiKey}` };
let failures = 0;
function check(name, cond, extra) {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? ' - ' + extra : ''}`);
  if (!cond) failures++;
}

// --- 1. Webhook fires on cancellation ---
let received = null;
const webhookServer = createServer((req, res) => {
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200);
    res.end('ok');
  });
});
await new Promise((resolve) => webhookServer.listen(4322, resolve));

const epubBytes = await readFile(path.join(__dirname, '..', 'fixtures', 'sample.epub'));
const form = new FormData();
form.append('file', new Blob([epubBytes], { type: 'application/epub+zip' }), 'sample.epub');
form.append('callback_url', 'http://localhost:4322/webhook');
const convertRes = await fetch(`${baseUrl}/api/v1/convert`, { method: 'POST', headers: auth, body: form });
const { job_id: jobId } = await convertRes.json();
check('job created for cancel-webhook test', convertRes.status === 201 && Boolean(jobId));

// Cancel immediately - it may already be queued or (racily) processing; either is fine.
const delRes = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, { method: 'DELETE', headers: auth });
check('DELETE (cancel) returns 204', delRes.status === 204);

await new Promise((r) => setTimeout(r, 2000)); // let the webhook worker fire
webhookServer.close();
check('cancellation webhook was received', Boolean(received), JSON.stringify(received));
if (received) {
  check('webhook payload reports cancelled status', received.status === 'cancelled', received.status);
  check('webhook payload job_id matches', received.job_id === jobId);
}

// --- 2. SSRF guard rejects a file_url that resolves to a private address ---
{
  const res = await fetch(`${baseUrl}/api/v1/convert`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_url: 'https://localhost/definitely-not-a-real-epub.epub' }),
  });
  const body = await res.json();
  check('submitting a localhost file_url is accepted at the API layer (validated worker-side)', res.status === 201, JSON.stringify(body));
  if (res.status === 201) {
    const ssrfJobId = body.job_id;
    let job;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const r = await fetch(`${baseUrl}/api/v1/status/${ssrfJobId}`, { headers: auth });
      job = await r.json();
      if (job.status === 'failed') break;
      await new Promise((r2) => setTimeout(r2, 1500));
    }
    check('job targeting localhost fails', job?.status === 'failed', JSON.stringify(job?.error));
    check(
      'failure reason is the SSRF guard (INVALID_URL, non-public address)',
      job?.error?.error_code === 'INVALID_URL' && /non-public address/i.test(job?.error?.message || ''),
      JSON.stringify(job?.error),
    );
  }
}

// --- 3. Previously-dead API metrics now have real samples ---
{
  const res = await fetch(`${baseUrl}/metrics`);
  const text = await res.text();
  const httpDurationHasSamples = /^http_request_duration_seconds_count\{[^}]*\}\s+[1-9]/m.test(text);
  const jobsSubmittedHasSamples = /^conversion_jobs_started_total\s+[1-9]/m.test(text);
  check('http_request_duration_seconds has recorded samples', httpDurationHasSamples);
  check('conversion_jobs_started_total (API) has recorded samples', jobsSubmittedHasSamples);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
