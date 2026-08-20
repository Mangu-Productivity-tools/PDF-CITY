-- 001_init.sql
-- Core tables per Spec v2.0 "Database Schema" + PRD v3 §7.4/§7.5.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,              -- first 8 chars, shown to the user for identification
  key_hash      TEXT NOT NULL,               -- sha256(full key), never store the raw key
  scope         TEXT NOT NULL DEFAULT 'convert' CHECK (scope IN ('read', 'convert')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS conversion_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress        SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  engine          TEXT NOT NULL DEFAULT 'chrome' CHECK (engine IN ('chrome', 'calibre')),
  file_url        TEXT,
  source_filename TEXT,
  output_key      TEXT,                      -- storage object key, e.g. conversions/{id}.pdf
  options         JSONB NOT NULL DEFAULT '{}'::jsonb,
  callback_url    TEXT,
  webhook_secret  TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- title, creator, page_count, etc.
  error_code      TEXT,
  error_message   TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  worker_id       TEXT,
  api_key_id      UUID REFERENCES api_keys(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status ON conversion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_expires_at ON conversion_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_api_key_id ON conversion_jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_created_at ON conversion_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_metadata_gin ON conversion_jobs USING GIN (metadata);

-- keep updated_at current on every row change
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversion_jobs_updated_at ON conversion_jobs;
CREATE TRIGGER trg_conversion_jobs_updated_at
  BEFORE UPDATE ON conversion_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
