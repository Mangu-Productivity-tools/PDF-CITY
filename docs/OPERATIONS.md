# Operations Runbook

Day-to-day operations guide for the `pubpdf` EPUB → PDF conversion service.

---

## 1. Health Checks

### API
- **Liveness:** `GET /health` → `{"status":"ok"}` (200)
- **Readiness:** `GET /ready` → checks DB + Redis connectivity

### Worker
- **Internal health server** (port `WORKER_HEALTH_PORT`, default 3001)
  - `GET /health` → `{"status":"ok","activeJobs":<n>}`
  - `GET /ready` → checks Redis + DB
  - `GET /metrics` → Prometheus text format

### Prometheus metrics (API + Worker)
Key metrics to alert on:

| Metric | Alert threshold |
|--------|----------------|
| `conversion_jobs_failed_total` rate | > 5/min sustained |
| `conversion_job_duration_seconds` p99 | > 120s |
| `active_jobs` | ≥ `WORKER_CONCURRENCY` for > 5 min (queue backup) |
| `http_request_duration_seconds` p95 | > 2s on POST /convert |
| Node.js `process_resident_memory_bytes` | > 1.8GB on worker |

---

## 2. Queue Management

BullMQ queues are visible in the Redis instance. Use `redis-cli` or `ioredis` to inspect:

```bash
# Count jobs by state
redis-cli -h <REDIS_HOST> llen bull:epub-conversion:wait
redis-cli -h <REDIS_HOST> zcard bull:epub-conversion:active
redis-cli -h <REDIS_HOST> zcard bull:epub-conversion:failed

# Drain stalled jobs (if the worker process died mid-job)
# Run from a node REPL with ioredis + bullmq configured:
# const q = new Queue('epub-conversion', { connection }); await q.obliterate({ force: true });
```

To retry all failed jobs:
```js
import { Queue } from 'bullmq';
const q = new Queue('epub-conversion', { connection });
const failed = await q.getFailed();
await Promise.all(failed.map(j => j.retry()));
```

---

## 3. Scaling

### Cloud Run auto-scaling
- **API:** scales to 0 when idle (min-instances=1 in prod to avoid cold start latency). Increase `--max-instances` if queue backup grows.
- **Worker:** scales to 0 when idle. Each worker instance processes up to `WORKER_CONCURRENCY` jobs in parallel (default 2). Scale out by increasing `--max-instances`.

### Manual scale (Kubernetes)
```bash
kubectl -n epub2pdf scale deployment epub2pdf-worker --replicas=5
```

---

## 4. Log Inspection

### Cloud Run
```bash
# API logs
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=pubpdf-api' \
  --limit=100 --format=json | jq '.[] | .jsonPayload'

# Worker logs — filter failed jobs
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=pubpdf-worker AND jsonPayload.msg:"job failed"' \
  --limit=50 --format=json
```

### Database — job audit trail
```sql
-- Recent failures with error details
SELECT id, error_code, error_message, created_at, updated_at
FROM conversion_jobs
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;

-- Structured conversion logs for a specific job
SELECT level, message, created_at
FROM conversion_logs
WHERE job_id = '<job-uuid>'
ORDER BY created_at;

-- Webhook delivery history
SELECT attempt, status_code, succeeded, error, created_at
FROM webhook_attempts
WHERE job_id = '<job-uuid>'
ORDER BY attempt;
```

---

## 5. Data Retention & Cleanup

PDF artifacts and job records expire after `OBJECT_RETENTION_DAYS` (default 30 days).

The `conversion_jobs.expires_at` column is set when a job completes. Run the cleanup script to delete expired artifacts and job rows:

```bash
# Dry-run first to see what would be deleted
node scripts/cleanup.js --dry-run

# Apply (deletes S3 objects then DB rows in batches of 100)
node scripts/cleanup.js

# Tune batch size and total limit
node scripts/cleanup.js --batch-size=500 --limit=50000
```

Or schedule it as a Cloud Run job / Kubernetes CronJob to run nightly.

The following SQL identifies expired records without deleting them:

```sql
SELECT id, output_key, expires_at
FROM conversion_jobs
WHERE expires_at < now() AND output_key IS NOT NULL;
```

Delete the objects from Cloud Storage, then delete the rows. The `conversion_logs` and `webhook_attempts` tables cascade-delete on `job_id`.

---

## 6. Incident Response

### Job stuck in `processing`
1. Check worker logs for the `jobId`.
2. Check if the BullMQ job is still in the `active` set (`redis-cli zrange bull:epub-conversion:active 0 -1`).
3. If the worker pod is gone (crash, OOM), BullMQ's stall detection (default 30s) will re-queue the job after the worker's `WORKER_CONCURRENCY × 30s` window. Manually move stalled jobs: `await q.moveJobFromActiveToWait(jobId)`.
4. If the job exceeded `JOB_ATTEMPTS` (5), it's in `failed` state. Retry or cancel via the API (`DELETE /api/v1/jobs/:id`).

### Chrome OOM
Worker crashed with `reason=SIGSEGV` or memory limit:
- Increase Cloud Run memory (`--memory=4Gi`).
- Add `--js-flags="--max-old-space-size=1536"` to Chromium args in `packages/worker/src/engines/chrome.js`.
- Enable Chrome's `--disable-dev-shm-usage` (already on) and ensure `/tmp` has sufficient headroom.

### Cloud Storage upload failures
Error code `UPLOAD_FAILED`:
- Check IAM: the worker service account must have `roles/storage.objectAdmin` on the bucket.
- Check if the bucket exists: `gsutil ls gs://pubpdf-conversions`.
- Abort any stale multipart uploads: call `storage.abortStaleMultipartUploads()`.

### Webhook delivery failures
Checked in `webhook_attempts`. Max 5 attempts with exponential backoff (5s base, 5min cap). If all 5 fail:
- Verify the `callback_url` is reachable from the worker's network.
- Re-enqueue manually via `enqueueWebhookDelivery(jobId)` from a node REPL connected to Redis.

---

## 7. Backup and Restore

### PostgreSQL
```bash
# Backup (Cloud SQL)
gcloud sql export sql pubpdf-db \
  gs://pubpdf-backups/$(date +%Y%m%d)/epub2pdf.sql.gz \
  --database=epub2pdf

# Restore
gcloud sql import sql pubpdf-db \
  gs://pubpdf-backups/20260825/epub2pdf.sql.gz \
  --database=epub2pdf
```

### Redis
Redis is a queue store only — no persistent application state. Losing Redis data means any queued or active jobs are lost (they'll be marked failed on the next worker health cycle or left in the database in `processing` state and can be re-submitted). Redis AOF persistence is recommended but not required.

---

## 8. Dependency Updates

```bash
# Check for outdated packages
npm outdated --workspaces

# Update lockfile only (review each package's changelog before upgrading majors)
npm update --workspaces
npm audit fix
```

Run the full test suite after any update: `npm run test --workspaces --if-present`.

---

## 9. Secret Rotation

1. Generate a new key value.
2. Update Secret Manager: `echo -n "<new>" | gcloud secrets versions add DATABASE_URL --data-file=-`.
3. Trigger a new Cloud Run revision to pick up the new secret version (deploy the same image).
4. Verify health checks pass.
5. Disable the old secret version: `gcloud secrets versions disable <version> --secret=DATABASE_URL`.
