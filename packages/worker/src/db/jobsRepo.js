import { getPool } from './pool.js';
import { OBJECT_RETENTION_DAYS } from '@epub2pdf/shared';

export async function getJobById(id) {
  const { rows } = await getPool().query('SELECT * FROM conversion_jobs WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function markProcessing(id, workerId) {
  await getPool().query(
    `UPDATE conversion_jobs SET status = 'processing', worker_id = $2, progress = GREATEST(progress, 5)
     WHERE id = $1`,
    [id, workerId],
  );
}

export async function setProgress(id, progress) {
  await getPool().query('UPDATE conversion_jobs SET progress = $2 WHERE id = $1', [id, progress]);
}

export async function markCompleted(id, { outputKey, metadata }) {
  const { rows } = await getPool().query(
    `UPDATE conversion_jobs
     SET status = 'completed', progress = 100, output_key = $2, metadata = metadata || $3::jsonb,
         completed_at = now(), expires_at = now() + ($4 || ' days')::interval,
         error_code = NULL, error_message = NULL
     WHERE id = $1 AND status <> 'cancelled'
     RETURNING *`,
    [id, outputKey, JSON.stringify(metadata ?? {}), String(OBJECT_RETENTION_DAYS)],
  );
  return rows[0];
}

/** Terminal failure: no more BullMQ attempts left (or a non-retryable error). */
export async function markFailed(id, { code, message }) {
  const { rows } = await getPool().query(
    `UPDATE conversion_jobs
     SET status = 'failed', error_code = $2, error_message = $3, retry_count = retry_count + 1
     WHERE id = $1 AND status <> 'cancelled'
     RETURNING *`,
    [id, code, message],
  );
  return rows[0];
}

/** Non-terminal failure: record the latest error for visibility, but a retry is still coming. */
export async function recordAttemptError(id, { code, message }) {
  const { rows } = await getPool().query(
    `UPDATE conversion_jobs
     SET error_code = $2, error_message = $3, retry_count = retry_count + 1
     WHERE id = $1 AND status <> 'cancelled'
     RETURNING *`,
    [id, code, message],
  );
  return rows[0];
}

export async function logEvent(jobId, level, message, correlationId) {
  await getPool().query(
    'INSERT INTO conversion_logs (job_id, level, message, correlation_id) VALUES ($1, $2, $3, $4)',
    [jobId, level, message, correlationId ?? null],
  );
}

export async function recordWebhookAttempt(jobId, { attempt, statusCode, succeeded, error }) {
  await getPool().query(
    `INSERT INTO webhook_attempts (job_id, attempt, status_code, succeeded, error)
     VALUES ($1, $2, $3, $4, $5)`,
    [jobId, attempt, statusCode ?? null, succeeded, error ?? null],
  );
}

export async function writeAuditLog(actor, action, subjectType, subjectId, details = {}) {
  await getPool().query(
    'INSERT INTO audit_log (actor, action, subject_type, subject_id, details) VALUES ($1, $2, $3, $4, $5)',
    [actor, action, subjectType, subjectId, JSON.stringify(details)],
  );
}
