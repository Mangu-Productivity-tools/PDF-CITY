# Architecture

This document describes the system **as it is actually implemented today** (Phase 1 —
see `docs/ROADMAP.md` for what that means and what comes next). It does not describe
the full long-term vision in the v3 PRD; where this platform diverges from that
vision, this document says so explicitly.

Ground truth for the API surface is `docs/API_CONTRACT.md`. This document covers the
pieces behind that API: the worker, the datastores, the rendering engines, and how a
job moves through the system.

## Components

1. **API (`packages/api`)** — Node.js/Express REST service. Handles authentication,
   request validation, rate limiting, job CRUD, enqueues conversion jobs onto BullMQ,
   and generates signed download URLs. Exposes `GET /health`, `GET /ready`, and
   `GET /metrics` (unauthenticated — restrict these at the network/ingress layer in
   any real deployment).

2. **Worker (`packages/worker`)** — one or more processes running two BullMQ
   `Worker` instances in the same process:
   - a **conversion worker** consuming the `epub-conversion` queue, which runs the
     actual pipeline (download → extract → parse → assemble → render → upload →
     mark complete → enqueue webhook);
   - a **webhook worker** consuming the `webhook-delivery` queue, which delivers
     the HMAC-signed callback POST and records each attempt.

   Concurrency for both is controlled by `MAX_CONCURRENT_JOBS` (default 10; the
   webhook worker runs at `max(2, floor(concurrency / 2))`). The worker process
   also runs its own small HTTP server (`packages/worker/src/healthServer.js`,
   default port 3001) exposing `/health`, `/ready` (checks Postgres + Redis), and
   `/metrics`.

3. **PostgreSQL** — system of record. Tables (see `db/migrations/`):
   `api_keys`, `conversion_jobs`, `conversion_logs`, `webhook_attempts`,
   `audit_log`. No ORM — both API and worker use `pg` directly via small
   repository modules (`src/db/jobsRepo.js` in each package).

4. **Redis / BullMQ** — two named queues on one Redis instance
   (`REDIS_URL`): `epub-conversion` and `webhook-delivery`. BullMQ owns
   attempt-counting, exponential backoff, and delayed retries for both.

5. **S3-compatible object storage** — holds two kinds of objects:
   `uploads/{job_id}.epub` (only for multipart/form-data submissions — URL-based
   submissions are streamed straight from `file_url`, never staged in S3) and
   `conversions/{job_id}.pdf` (the rendered output). Works against real AWS S3 or
   a MinIO endpoint (local dev/docker-compose uses MinIO). All access outside the
   worker process goes through time-limited signed GET URLs
   (`packages/shared/src/storage.js`) — objects are never made public.

6. **Rendering engines** (`packages/worker/src/engines/`) — pluggable, selected
   per-job via `options.engine`:
   - **Chrome (`chrome.js`)** — `puppeteer-core` driving an externally-supplied
     Chromium binary (`PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH` — puppeteer-core
     never downloads its own browser). **Verified working end-to-end**: see
     `scripts/smoke-test.js`, which posts a real EPUB fixture through
     `POST /convert`, polls `GET /status`, and downloads and validates a real PDF
     — exercising API → queue → worker → Chrome → S3 → signed URL, all for real.
   - **Calibre (`calibre.js`)** — shells out to the `ebook-convert` CLI via
     `child_process.execFile`. Implemented, but Calibre is not installed in this
     dev sandbox, so it has never actually been executed here. See
     `docs/RISKS.md` item (a).

7. **Next.js frontend (`packages/web`)** — being built concurrently by a separate
   workstream. At the time of writing, `packages/web` contains only a placeholder
   `package.json`. It is architecturally just a client of the REST API in
   `docs/API_CONTRACT.md`; nothing in this document depends on its internals.

8. **Deployment layer (`infra/`, `.github/`)** — Docker/Kubernetes/CI, also being
   built concurrently by a separate workstream and not covered here, beyond noting
   the contract the application expects from it: the health/readiness endpoints
   above, all configuration via environment variables (`.env.example` is the
   canonical list), and a scrapeable `/metrics` endpoint on both API and worker.

## Diagram

```
                                   ┌─────────────────────┐
                                   │   Next.js frontend    │   (packages/web —
                                   │   (separate workstream)│   built in parallel)
                                   └──────────┬───────────┘
                                              │ HTTPS, REST (docs/API_CONTRACT.md)
                                              ▼
 API clients (Carol/Bob/    ┌──────────────────────────────┐
 CI pipelines/frontend) ───▶│      API (packages/api)       │
                             │  auth · validation · rate     │
                             │  limit · signed URLs          │
                             └───────┬───────────┬──────────┘
                                     │           │
                          enqueue    │           │  read/write jobs,
                          BullMQ job │           │  api_keys, audit_log
                                     ▼           ▼
                        ┌─────────────────┐ ┌───────────────┐
                        │  Redis (BullMQ)  │ │  PostgreSQL    │
                        │  epub-conversion │ │  conversion_jobs│
                        │  webhook-delivery│ │  api_keys       │
                        └────────┬─────────┘ │  conversion_logs│
                                 │            │  webhook_attempts│
                                 │            │  audit_log      │
                                 │            └────────▲────────┘
                                 ▼                     │ status/progress
                    ┌───────────────────────┐          │ updates
                    │  Worker (packages/worker)│────────┘
                    │  download → extract →    │
                    │  parse OPF → sanitize &   │
                    │  assemble HTML → render   │
                    └───┬───────────────┬──────┘
                        │               │
              ┌─────────┴───┐   ┌───────┴────────┐
              │ Chrome engine│   │ Calibre engine  │
              │ (Puppeteer,  │   │ (ebook-convert   │
              │  verified)   │   │  CLI, unverified)│
              └──────────────┘   └─────────────────┘
                        │
                        ▼
              ┌───────────────────────┐        ┌──────────────────────┐
              │ S3-compatible storage  │        │ Customer callback_url │
              │ (AWS S3 or MinIO)      │        │ (webhook, HMAC-signed,│
              │ uploads/*.epub         │        │ delivered by the      │
              │ conversions/*.pdf      │◀───────│ webhook-delivery      │
              │ SSE-AES256, signed-URL │  signed │ worker)               │
              │ access only            │  GET URL└──────────────────────┘
              └───────────────────────┘
```

## Request flow (happy path)

1. Client calls `POST /api/v1/convert` (JSON `file_url` or multipart `file`) with
   `Authorization: Bearer <key>`.
2. API validates the key (`requireAuth` → `findApiKeyByRawValue`, sha256 lookup),
   checks rate limit and per-key concurrency headroom, validates the payload
   (zod schemas in `packages/shared/src/jobSchema.js`; multipart uploads are also
   checked for the ZIP magic-byte header before being accepted).
3. For multipart uploads, the API stores the raw EPUB in S3
   (`uploads/{job_id}.epub`) and records `file_url` as an internal `s3://...`
   reference; for URL-based requests, `file_url` is the caller's HTTPS URL as-is.
4. API inserts a `conversion_jobs` row (`status='queued'`, `progress=0`) and
   enqueues a BullMQ job on `epub-conversion` using the job's UUID as the BullMQ
   job ID (so enqueueing is idempotent per job row).
5. API responds `201` with `job_id`, `status_url`, and an estimated duration.
6. A worker process picks up the BullMQ job and runs the pipeline described below.
7. On completion, the API's `GET /status/{job_id}` (or `GET /jobs/{job_id}/download`)
   returns a signed, time-limited download URL; if `callback_url` was set, the
   worker also POSTs the job's final state there.

## Job lifecycle state machine

```
          POST /convert
                │
                ▼
            ┌────────┐   worker picks up job, calls markProcessing
            │ queued │──────────────────────────────────────────┐
            └───┬────┘                                          │
                │ DELETE while queued                            ▼
                │ (cancelJob)                              ┌────────────┐
                ▼                                           │ processing │
          ┌───────────┐                                     └──┬──────┬──┘
          │ cancelled │◀────────────────────────────────────────┘      │
          └───────────┘   DELETE while processing (see note below)     │
                ▲                                                      │
                │                                          pipeline succeeds
                │                                                      │
                │                                                      ▼
                │                                              ┌────────────┐
                │                                              │ completed  │
                │                                              └────────────┘
                │
                │  pipeline throws, and this was the last retry attempt
                │  (or the error is non-retryable) — see below
                │                                              ┌────────────┐
                └─────────────────────────────────────────────▶│  failed    │
                                                                 └────────────┘
```

Statuses (`db/migrations/001_init.sql`, enforced by a `CHECK` constraint):
`queued`, `processing`, `completed`, `failed`, `cancelled`.

Step-by-step, per `packages/worker/src/processConversionJob.js`:

1. Worker loads the job row. If it's missing or already `cancelled`, the worker
   skips it silently (no retry, no error, no webhook) — this is what lets a job
   cancelled *before* a worker picks it up end cleanly.
2. `markProcessing`: `status='processing'`, `worker_id` set, `progress` bumped to
   at least 5.
3. Pipeline runs with progress checkpoints written to the DB as it goes:
   download source (20%) → unzip + reject-if-DRM (30%, checks for
   `META-INF/encryption.xml`) → parse `container.xml` + OPF manifest/spine (40%)
   → sanitize and assemble spine documents into one HTML file (55%) → render via
   the selected engine (80%) → upload the resulting PDF to S3 (95%) → 100%.
4. On success: `markCompleted` sets `status='completed'`, `progress=100`, stores
   `output_key` and metadata (title/creator/identifier/page_count/chapter_count/
   engine), sets `completed_at=now()` and
   `expires_at = now() + OBJECT_RETENTION_DAYS days` (30 by default). A webhook
   delivery is enqueued if `callback_url` is set.
5. On failure: the error is classified. A fixed set of error codes —
   `INVALID_URL`, `INVALID_EPUB`, `DRM_NOT_SUPPORTED`, `UNZIP_FAILED`,
   `PARSE_FAILED` — are treated as **non-retryable**
   (`packages/worker/src/lib/errors.js`) and immediately wrapped in BullMQ's
   `UnrecoverableError`, skipping straight to a terminal failure regardless of
   attempts remaining. Everything else is retried by BullMQ up to
   `JOB_ATTEMPTS` (5) times with exponential backoff (`JOB_BACKOFF_BASE_MS` =
   5000ms base). Only once an attempt is terminal (last attempt, or
   non-retryable) does the DB row flip to `status='failed'`
   (`markFailed`, which also enqueues a webhook delivery so failed jobs notify
   the callback too); a non-terminal attempt just records the latest error via
   `recordAttemptError` and leaves `status='processing'` until the next attempt
   runs.
6. A `finally` block always cleans up the job's temp directory
   (`rm -rf`, best-effort) and updates the `active_jobs` /
   `rendering_memory_bytes` gauges, whether the job succeeded or failed.

**Cancellation nuance worth knowing**: `DELETE /jobs/{job_id}` on a `queued` or
`processing` job sets `status='cancelled'` immediately and enqueues a
cancellation webhook right away (see below), and both `markCompleted` and
`markFailed` are guarded (`WHERE status <> 'cancelled'`) so a cancelled row's
final status can't be overwritten. However, cancelling a job that a worker has
*already started* processing does not interrupt the in-flight download/render call
— the worker keeps running that pipeline step to completion or until it times out.
In the rare case a render finishes after its job was cancelled, the rendered PDF is
still uploaded to storage, but the job record stays `cancelled` (the DB guard
above), so that object is orphaned - nothing in the API will ever point to it,
since `toJobResponse` only attaches a `download_url` for `status === 'completed'`.
There is no active "kill the in-flight Puppeteer/Calibre process" signal today.

`DELETE` on a job that is already `completed`/`failed`/`cancelled` instead deletes
the stored object (best-effort) and hard-deletes the DB row.

`PUT /jobs/{job_id}` only succeeds while `status='queued'` (enforced by the same
`WHERE status = 'queued'` guard at the DB layer); once a job has moved to
`processing` or beyond, the API rejects the update (`VALIDATION_ERROR`, 400).

**Webhooks fire on `completed`, terminal `failed`, and `cancelled`.** The first
two are enqueued by the worker (`processConversionJob.js`) when it reaches that
terminal state; `cancelled` is enqueued directly by the API
(`packages/api/src/routes/jobs.js`, via its own producer-side queue handle in
`packages/api/src/queue/queue.js`) at the moment `DELETE /jobs/{job_id}` cancels
a queued/processing job - the API doesn't wait for the worker to notice, since
for a `queued` job the worker may not even have picked it up yet. All three
producers land on the same `webhook-delivery` queue, consumed by one webhook
worker. Delivery itself is a separate BullMQ job on `webhook-delivery`
(`packages/worker/src/lib/webhook.js`): POST the job's current state as JSON to
`callback_url`, header `X-Hub-Signature: sha256=<hmac>` computed with a
per-job random secret (`webhook_secret`, generated with `crypto.randomBytes(32)`
at job-creation time — not a single shared secret across jobs), up to
`WEBHOOK_MAX_ATTEMPTS` (5) attempts with exponential backoff
(`WEBHOOK_BACKOFF_BASE_MS` = 5000ms base). Every attempt, success or failure, is
recorded in `webhook_attempts`.

## Storage layout

| Key pattern | Written by | Contents |
|---|---|---|
| `uploads/{job_id}.epub` | API (multipart submissions only) | original uploaded EPUB |
| `conversions/{job_id}.pdf` | Worker | rendered output PDF |

Every object is written with `ServerSideEncryption: 'AES256'` (S3 SSE-256). No
object is ever given a public ACL or bucket policy — the only supported access
path is a signed GET URL (`SIGNED_URL_EXPIRY_SECONDS`, 24h default), generated
on demand by the API (`GET /status`, `GET /jobs/{id}/download`) or the worker
(webhook payloads). See `docs/SECURITY.md` and `docs/COMPLIANCE.md` for what this
does and does not guarantee.

## Observability

Both API and worker expose Prometheus-format `/metrics`. The worker's metrics are
actively recorded throughout `processConversionJob.js`:
`conversion_jobs_started_total`, `conversion_jobs_processed_total`,
`conversion_jobs_failed_total{error_code}`, `conversion_jobs_duration_seconds`
(histogram), `active_jobs` (gauge), `engine_usage_total{engine}`, and
`rendering_memory_bytes` (worker RSS, sampled after each job) — plus Node's
default process metrics via `prom-client`'s `collectDefaultMetrics`.

The API's `/metrics` route (`packages/api/src/routes/metrics.js`) also declares
an `http_request_duration_seconds` histogram and a `conversion_jobs_started_total`
counter. Both are live: a request-timing middleware in `app.js` observes every
request's duration labeled by matched route (`req.route.path`, not the raw URL,
to avoid a cardinality explosion from path params like `/status/{job_id}`),
method, and status code; `conversion_jobs_started_total` increments once per
successfully-enqueued `POST /convert` (`packages/api/src/routes/convert.js`) -
this is the API-side "jobs submitted" count, distinct from the worker's own
`conversion_jobs_started_total` (same metric name, different process/target in
Prometheus terms - one counts submission, the other counts a worker actually
picking the job up).

Structured JSON logs (Pino) on both sides include `jobId` and a `correlationId`
(the BullMQ job ID). Nothing is currently forwarded to an external log
aggregator or error tracker — see `docs/ROADMAP.md` Phase 2 and the note on
Sentry/Datadog in `docs/COMPLIANCE.md`.

## What this architecture does not include

No multi-tenancy/data isolation beyond one `api_key_id` foreign key per job, no
OAuth2, no admin API-key-management surface, no real Sentry/Datadog wiring (env
vars exist as placeholders only), and no infrastructure for multi-AZ failover.
See `docs/ROADMAP.md` for what's planned versus what's aspirational PRD scope.
