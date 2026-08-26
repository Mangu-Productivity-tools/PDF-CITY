/**
 * Unit tests for packages/api/src/routes/jobs.js
 *
 * These tests exercise the route registry structure and the shared
 * toJobResponse helper without a real Postgres connection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal job record (mirrors a DB row).
function makeJob(overrides = {}) {
  return {
    id: 'job-abc',
    status: 'queued',
    progress: 0,
    engine: 'chrome',
    file_url: 's3://bucket/uploads/job-abc.epub',
    source_filename: 'book.epub',
    output_key: null,
    options: {},
    callback_url: null,
    webhook_secret: null,
    api_key_id: 'key-123',
    metadata: null,
    error_code: null,
    error_message: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- route inventory ----

test('jobs router registers all required routes', async () => {
  const { default: router } = await import('../src/routes/jobs.js');

  const routes = router.stack
    .filter((l) => l.route)
    .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));

  const paths = routes.map((r) => r.path);
  assert.ok(paths.includes('/jobs'), 'GET /jobs (list) must be registered');
  assert.ok(paths.includes('/jobs/:job_id'), 'routes on /jobs/:job_id must be registered');
  assert.ok(paths.includes('/jobs/:job_id/download'), 'GET /jobs/:job_id/download must be registered');

  const jobIdRoutes = routes.filter((r) => r.path === '/jobs/:job_id');
  const allMethods = jobIdRoutes.flatMap((r) => r.methods);
  assert.ok(allMethods.includes('get'), 'GET /jobs/:job_id must exist');
  assert.ok(allMethods.includes('patch'), 'PATCH /jobs/:job_id must exist');
  assert.ok(allMethods.includes('delete'), 'DELETE /jobs/:job_id must exist');
});

test('router stack exposes PATCH /jobs/:job_id route (not PUT)', async () => {
  const { default: router } = await import('../src/routes/jobs.js');

  const patchLayer = router.stack.find(
    (l) => l.route?.path === '/jobs/:job_id' && l.route?.methods?.patch,
  );
  assert.ok(patchLayer, 'PATCH /jobs/:job_id must be registered');

  const putLayer = router.stack.find(
    (l) => l.route?.path === '/jobs/:job_id' && l.route?.methods?.put,
  );
  assert.equal(putLayer, undefined, 'PUT /jobs/:job_id must NOT exist — spec requires PATCH');
});

// ---- toJobResponse shape ----

test('toJobResponse shape: basic fields are present', async () => {
  const { toJobResponse } = await import('../src/db/jobsRepo.js');
  const job = makeJob();
  const resp = toJobResponse(job);
  assert.equal(resp.job_id, job.id);
  assert.equal(resp.status, 'queued');
  assert.equal(resp.progress, 0);
  assert.ok('created_at' in resp);
});

test('toJobResponse includes download_url only for completed jobs', async () => {
  const { toJobResponse } = await import('../src/db/jobsRepo.js');

  const pending = makeJob({ status: 'queued' });
  assert.equal(toJobResponse(pending).download_url, null);

  const completed = makeJob({ status: 'completed', output_key: 'conversions/job-abc.pdf' });
  const url = 'https://example.com/signed-url';
  assert.equal(toJobResponse(completed, { downloadUrl: url }).download_url, url);

  const completedNoUrl = makeJob({ status: 'completed', output_key: 'conversions/job-abc.pdf' });
  assert.equal(toJobResponse(completedNoUrl).download_url, null);
});

test('toJobResponse includes error object only when error_code is set', async () => {
  const { toJobResponse } = await import('../src/db/jobsRepo.js');

  const failed = makeJob({ status: 'failed', error_code: 'DRM_NOT_SUPPORTED', error_message: 'DRM detected' });
  assert.deepEqual(toJobResponse(failed).error, { error_code: 'DRM_NOT_SUPPORTED', message: 'DRM detected' });

  assert.equal(toJobResponse(makeJob()).error, null);
});
