-- 002_logs_and_webhooks.sql
-- Optional structured log + webhook delivery tracking. 30-day retention
-- (see scripts/cleanup.js and docs/COMPLIANCE.md).

CREATE TABLE IF NOT EXISTS conversion_logs (
  id              BIGSERIAL PRIMARY KEY,
  job_id          UUID REFERENCES conversion_jobs(id) ON DELETE CASCADE,
  level           TEXT NOT NULL DEFAULT 'info',
  message         TEXT NOT NULL,
  correlation_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversion_logs_job_id ON conversion_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_conversion_logs_created_at ON conversion_logs(created_at);

CREATE TABLE IF NOT EXISTS webhook_attempts (
  id              BIGSERIAL PRIMARY KEY,
  job_id          UUID REFERENCES conversion_jobs(id) ON DELETE CASCADE,
  attempt         INT NOT NULL,
  status_code     INT,
  succeeded       BOOLEAN NOT NULL DEFAULT false,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_attempts_job_id ON webhook_attempts(job_id);

-- Immutable-ish audit trail for compliance (GDPR/CCPA/FERPA technical building
-- block - see docs/COMPLIANCE.md). Application code should only ever INSERT.
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGSERIAL PRIMARY KEY,
  actor           TEXT NOT NULL,          -- api_key_id or 'system'
  action          TEXT NOT NULL,          -- e.g. 'job.created', 'job.deleted', 'data.export'
  subject_type    TEXT NOT NULL,          -- e.g. 'conversion_job'
  subject_id      TEXT,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_subject ON audit_log(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
