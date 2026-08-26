import { getPool } from './pool.js';
import { OBJECT_RETENTION_DAYS } from '@epub2pdf/shared';

function toJobResponse(row, { downloadUrl } = {}) {
  return {
    job_id: row.id,
    status: row.status,
    progress: row.progress,
    engine: row.engine,
    metadata: row.metadata,
    download_url: row.status === 'completed' ? downloadUrl ?? null : null,
    expires_at: row.expires_at,
    error: row.error_code ? { error_code: row.error_code, message: row.error_message } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createJob({ id, fileUrl, sourceFilename, options, callbackUrl, webhookSecret, apiKeyId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO conversion_jobs
       (id, file_url, source_filename, options, callback_url, webhook_secret, engine, api_key_id)
     VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id ?? null,
      fileUrl,
      sourceFilename ?? null,
      JSON.stringify(options ?? {}),
      callbackUrl ?? null,
      webhookSecret ?? null,
      options?.engine ?? 'chrome',
      apiKeyId,
    ],
  );
  return rows[0];
}

export async function getJobById(id) {
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM conversion_jobs WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function listJobs({ apiKeyId, status, from, to, page, pageSize }) {
  const pool = getPool();
  const conditions = ['api_key_id = $1'];
  const params = [apiKeyId];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`created_at <= $${params.length}`);
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * pageSize;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT * FROM conversion_jobs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM conversion_jobs WHERE ${where}`, params),
  ]);

  return { rows, total: countRows[0]?.total ?? 0 };
}

export async function cancelJob(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE conversion_jobs
     SET status = 'cancelled',
         expires_at = COALESCE(expires_at, now() + ($2 || ' days')::interval)
     WHERE id = $1 AND status IN ('queued', 'processing')
     RETURNING *`,
    [id, String(OBJECT_RETENTION_DAYS)],
  );
  return rows[0] ?? null;
}

export async function deleteJobRecord(id) {
  const pool = getPool();
  await pool.query('DELETE FROM conversion_jobs WHERE id = $1', [id]);
}

export async function updateJobOptions(id, options, apiKeyId) {
  const pool = getPool();
  const conditions = apiKeyId
    ? `WHERE id = $1 AND status = 'queued' AND api_key_id = $4`
    : `WHERE id = $1 AND status = 'queued'`;
  const params = apiKeyId
    ? [id, JSON.stringify(options), options?.engine ?? null, apiKeyId]
    : [id, JSON.stringify(options), options?.engine ?? null];
  const { rows } = await pool.query(
    `UPDATE conversion_jobs
     SET options = $2, engine = COALESCE($3, engine)
     ${conditions}
     RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function countActiveJobsForKey(apiKeyId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS active
     FROM conversion_jobs
     WHERE api_key_id = $1 AND status IN ('queued', 'processing')`,
    [apiKeyId],
  );
  return rows[0]?.active ?? 0;
}

export async function writeAuditLog(actor, action, subjectType, subjectId, details = {}) {
  await getPool().query(
    'INSERT INTO audit_log (actor, action, subject_type, subject_id, details) VALUES ($1, $2, $3, $4, $5)',
    [actor, action, subjectType, subjectId, JSON.stringify(details)],
  );
}

export { toJobResponse };
