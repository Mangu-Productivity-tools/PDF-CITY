# ADR 0002: Use BullMQ/Redis for the job queue

## Status

Accepted. Implemented in `packages/api/src/queue/queue.js` and
`packages/worker/src/queue/`.

## Context

Conversion requests need to be handed off from the API to one or more worker
processes asynchronously: a single EPUB → PDF conversion can take anywhere from
seconds to minutes (Chrome's timeout is set to 10 minutes, Calibre's to 20 —
see `packages/shared/src/constants.js`), far too long for a synchronous HTTP
request/response cycle. The system also needs, per the source spec's "Worker &
Queue Architecture" and "Error Handling & Retry Logic" sections and PRD §7.3:

- configurable worker concurrency,
- automatic retries with exponential backoff on transient failures (spec:
  "5 attempts, exponential, base 5000ms, max 5 min"),
- the same retry/backoff shape for a second, independent concern — outbound
  webhook delivery (PRD §7.3: "up to 5 attempts with exponential backoff"),
- graceful shutdown (finish in-flight jobs on `SIGTERM` rather than dropping
  them), and
- basic observability (queue length, active jobs) for autoscaling and
  alerting.

Candidates considered: a managed cloud queue (e.g. SQS), a general message
broker (e.g. RabbitMQ), a Postgres-backed queue (e.g. `pg-boss`, avoiding a new
stateful dependency entirely), or a Redis-backed library. Node.js is the
platform for both API and worker, which made a Node-native library attractive.

## Decision

Use **BullMQ** on **Redis** as the job queue for both conversion jobs
(`epub-conversion` queue) and webhook delivery (`webhook-delivery` queue),
run as two separate named queues on the same Redis instance
(`packages/worker/src/queue/connection.js`,
`packages/api/src/queue/queue.js`).

Concretely: `enqueueConversionJob()` adds a job with `jobId: jobRow.id` (so
enqueueing is idempotent per database row), `attempts: JOB_ATTEMPTS` (5),
`backoff: { type: 'exponential', delay: JOB_BACKOFF_BASE_MS }` (5000ms base) —
directly mirroring the spec's retry numbers. `enqueueWebhookDelivery()` follows
the same shape with its own constants
(`WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_BACKOFF_BASE_MS`). The worker process runs
one `Worker` per queue, each with its own concurrency setting
(`MAX_CONCURRENT_JOBS` for conversions, half that — minimum 2 — for webhooks),
and both are closed gracefully on `SIGTERM`/`SIGINT` before the process exits
(`packages/worker/src/index.js`).

## Consequences

**Positive:**

- BullMQ's attempts/backoff/dead-letter primitives map almost directly onto
  what the spec asked for, with very little custom retry logic needed in
  application code — the non-retryable-error classification
  (`packages/worker/src/lib/errors.js`, wrapping certain error codes in
  BullMQ's `UnrecoverableError`) is the main piece of custom logic layered on
  top.
- One queue technology serves two different job types (conversions and
  webhook deliveries) with independent concurrency and backoff tuning, without
  needing two different systems.
- Redis is simple to run locally (`docker-compose.yml`) and is a well
  understood operational dependency.
- `removeOnComplete`/`removeOnFail` age-based cleanup (7-day dead-letter
  retention, per spec) is a queue-level configuration option, not something
  that has to be hand-built.

**Negative / accepted trade-offs:**

- Redis becomes a second required stateful dependency alongside PostgreSQL —
  both the API and worker's `/ready` endpoints check both, and the system
  cannot accept or process jobs if either is unreachable.
- Kubernetes autoscaling on queue depth (the spec's `redis_queue_length`
  external metric) requires an additional cluster add-on (KEDA or Prometheus
  Adapter) that isn't part of BullMQ/Redis itself and may not be present in a
  given cluster by default — see `docs/RISKS.md` item (b).
- BullMQ's job state and the `conversion_jobs` row's `status` column are two
  separate pieces of state that the application has to keep in sync by hand
  (e.g. `markProcessing`/`markCompleted`/`markFailed` calls at the right
  points in `processConversionJob.js`). This is what produces the cancellation
  nuance documented in `docs/ARCHITECTURE.md` — cancelling a job updates the
  Postgres row but has no mechanism to signal an in-flight BullMQ job's
  processor function to stop early.
