/**
 * Cross-service constants, sourced from the PRD/spec so the API, worker,
 * and web app can't drift out of sync with the documented behavior.
 */

export const JobStatus = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const TERMINAL_STATUSES = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

export const RenderEngine = Object.freeze({
  CHROME: 'chrome',
  CALIBRE: 'calibre',
});

export const DEFAULT_ENGINE = RenderEngine.CHROME;

export const PageSize = Object.freeze({
  A4: 'A4',
  LETTER: 'Letter',
  LEGAL: 'Legal',
});

// Spec: Environment & Configuration
export const LIMITS = Object.freeze({
  MAX_EPUB_SIZE_MB: Number(process.env.MAX_EPUB_SIZE_MB ?? 100),
  MAX_PAGE_COUNT: Number(process.env.MAX_PAGE_COUNT ?? 2000),
  MAX_FONT_SIZE_MB: Number(process.env.MAX_FONT_SIZE_MB ?? 10),
});

// Spec: Rate Limiting & Versioning
export const RATE_LIMIT = Object.freeze({
  REQUESTS_PER_MINUTE: Number(process.env.RATE_LIMIT_RPM ?? 60),
  MAX_CONCURRENT_JOBS_PER_USER: Number(process.env.MAX_CONCURRENT_JOBS_PER_USER ?? 10),
});

// Spec: S3 Upload & Storage
export const SIGNED_URL_EXPIRY_SECONDS = Number(process.env.SIGNED_URL_EXPIRY_SECONDS ?? 24 * 60 * 60);
export const OBJECT_RETENTION_DAYS = Number(process.env.OBJECT_RETENTION_DAYS ?? 30);

// Spec: Webhooks
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_BACKOFF_BASE_MS = 5000;
export const WEBHOOK_BACKOFF_MAX_MS = 5 * 60 * 1000;

// Spec: Worker & Queue Architecture
export const QUEUE_NAME = 'epub-conversion';
export const JOB_ATTEMPTS = 5;
export const JOB_BACKOFF_BASE_MS = 5000;
export const WEBHOOK_QUEUE_NAME = 'webhook-delivery';

// Spec: Rendering Engines - timeouts
export const CHROME_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const CALIBRE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

export const API_VERSION = 'v1';
