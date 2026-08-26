#!/usr/bin/env node
/**
 * Data-retention cleanup script.
 *
 * Deletes expired conversion jobs and their associated PDF artifacts from
 * object storage. Safe to run repeatedly (idempotent): already-deleted
 * storage objects are skipped, and the DB row is removed either way so the
 * next run won't revisit it. Cascade-deletes in the schema (002_*.sql)
 * handle `conversion_logs` and `webhook_attempts` rows automatically.
 *
 * Env vars: all the usual POSTGRES_URL / S3_* vars from .env.example.
 *
 * Usage:
 *   node scripts/cleanup.js [--dry-run] [--batch-size=100] [--limit=1000]
 *
 * In production, schedule this as a Cloud Scheduler job targeting a
 * Cloud Run job (or a cron in Kubernetes) — daily is sufficient given the
 * default 30-day retention window.
 */

import pg from 'pg';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = Number(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? 100);
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 10_000);

if (DRY_RUN) console.log('[cleanup] dry-run mode — no objects or rows will be deleted');

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://postgres:postgres@localhost:5432/epub2pdf';

const bucket = process.env.S3_BUCKET_NAME;
if (!bucket) {
  console.error('[cleanup] S3_BUCKET_NAME is required');
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || Boolean(process.env.S3_ENDPOINT),
  credentials:
    process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined,
});

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  let totalJobs = 0;
  let totalDeleted = 0;
  let totalErrors = 0;
  let offset = 0;

  try {
    while (totalJobs < LIMIT) {
      const { rows } = await client.query(
        `SELECT id, output_key
         FROM conversion_jobs
         WHERE expires_at < now() AND expires_at IS NOT NULL
         ORDER BY expires_at ASC
         LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset],
      );

      if (rows.length === 0) break;
      totalJobs += rows.length;

      for (const row of rows) {
        const jobId = row.id;
        const outputKey = row.output_key;

        if (outputKey && !DRY_RUN) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: outputKey }));
          } catch (err) {
            if (err.name !== 'NoSuchKey') {
              console.error(`[cleanup] failed to delete storage object ${outputKey} for job ${jobId}: ${err.message}`);
              totalErrors++;
              offset++;
              continue;
            }
          }
        } else if (outputKey && DRY_RUN) {
          console.log(`[cleanup] would delete s3://${bucket}/${outputKey} (job ${jobId})`);
        }

        if (!DRY_RUN) {
          await client.query('DELETE FROM conversion_jobs WHERE id = $1', [jobId]);
          totalDeleted++;
          console.log(`[cleanup] deleted job ${jobId}${outputKey ? ` + s3://${bucket}/${outputKey}` : ''}`);
        } else {
          console.log(`[cleanup] would delete job ${jobId}`);
        }
      }

      if (rows.length < BATCH_SIZE) break;
    }

    // Expire stuck processing/queued jobs that never transitioned to a terminal
    // state (worker crash, missed retry, etc.).  These have no expires_at set
    // by markCompleted/markFailed/cancelJob, so the loop above skips them.
    // Use a conservative 7-day window so a legitimately long-running job is
    // not evicted prematurely.
    const STUCK_THRESHOLD_DAYS = 7;
    if (!DRY_RUN) {
      const { rowCount } = await client.query(
        `DELETE FROM conversion_jobs
         WHERE status IN ('queued', 'processing')
           AND created_at < now() - ($1 || ' days')::interval`,
        [String(STUCK_THRESHOLD_DAYS)],
      );
      if (rowCount > 0) {
        console.log(`[cleanup] purged ${rowCount} stuck job(s) older than ${STUCK_THRESHOLD_DAYS} days`);
        totalDeleted += rowCount;
      }
    } else {
      const { rows: stuckRows } = await client.query(
        `SELECT id FROM conversion_jobs
         WHERE status IN ('queued', 'processing')
           AND created_at < now() - ($1 || ' days')::interval`,
        [String(STUCK_THRESHOLD_DAYS)],
      );
      if (stuckRows.length > 0) {
        console.log(`[cleanup] would purge ${stuckRows.length} stuck job(s) older than ${STUCK_THRESHOLD_DAYS} days`);
      }
    }
  } finally {
    await client.end();
  }

  console.log(
    `[cleanup] done — scanned ${totalJobs} expired jobs, deleted ${totalDeleted}, errors ${totalErrors}`,
  );
  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[cleanup] fatal:', err.message);
  process.exit(1);
});
