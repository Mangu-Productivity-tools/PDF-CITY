# Compliance (GDPR / CCPA / FERPA)

This document lists the concrete technical mechanisms in this codebase that are
*relevant* to GDPR, CCPA, and FERPA. Read the disclaimer at the bottom before
treating any of this as a compliance claim — it is deliberately not written as
marketing language.

## Technical mechanisms in place

### Audit trail

The `audit_log` table (`db/migrations/002_logs_and_webhooks.sql`) records actor,
action, subject type/id, and details as JSON, with a comment in the migration
noting the table is intended to be append-only ("Application code should only
ever INSERT"). A helper, `writeAuditLog()`, exists in
`packages/worker/src/db/jobsRepo.js`. This gives the system a place to record
who-did-what-when for later review, which is a standard building block for
data-subject-access and deletion-accounting requirements.

### Data retention and deletion

- `OBJECT_RETENTION_DAYS` (`packages/shared/src/constants.js`, default 30,
  matching PRD §7.5 / §8.8 and spec §"S3 Upload & Storage") is used to compute
  `expires_at` on every job at the moment it completes
  (`markCompleted` in `packages/worker/src/db/jobsRepo.js`:
  `expires_at = now() + OBJECT_RETENTION_DAYS days`).
- `conversion_jobs.expires_at` is indexed (`idx_conversion_jobs_expires_at`) so
  a future cleanup job can efficiently find expired rows.
- A caller can also explicitly delete a job's record and its stored PDF at any
  time via `DELETE /jobs/{job_id}` (`packages/api/src/routes/jobs.js`), which
  removes the S3 object and hard-deletes the database row.

**Known gap**: `expires_at` is computed and stored correctly, but nothing in
this repository currently *acts* on it. `db/migrations/002_logs_and_webhooks.sql`
references a `scripts/retention-cleanup.js` in a comment, but that script does
not exist in this repository yet. In practice, today, a completed job's PDF and
database row persist indefinitely past their `expires_at` date unless a caller
explicitly deletes them. Signed download URLs still expire independently after
`SIGNED_URL_EXPIRY_SECONDS` (24h default), so the *file becomes unreachable*
long before `expires_at`, but the underlying object and row are not actually
purged. This needs to be built before "PDFs are deleted after 30 days" can be
said to be true rather than intended. Track this in `docs/ROADMAP.md` Phase 2.

### Encryption at rest

Every object written to storage is uploaded with
`ServerSideEncryption: 'AES256'` (S3 SSE-256) —
`packages/shared/src/storage.js`, `putObject()`. This applies uniformly to both
uploaded source EPUBs and rendered output PDFs.

### Encryption in transit

The application does not terminate TLS itself — it's a plain Node HTTP server
(Express) with no TLS listener in `packages/api/src/index.js`. In transit
encryption depends on **a TLS-terminating ingress/load balancer sitting in
front of it**, which is expected to be provided by the deployment layer
(`infra/`, built by a separate workstream) rather than the application code.
This document records that assumption explicitly so it isn't lost: if this is
deployed without a TLS-terminating front end, there is no encryption in transit
for API traffic.

### API key handling

API keys are never stored in plaintext. `hashApiKey()`
(`packages/api/src/lib/apiKeys.js`) stores `sha256(raw_key)` in
`api_keys.key_hash`, and lookups hash the presented bearer token the same way
before querying. Only a short prefix (first 11 characters) is retained
unhashed, for display/identification purposes.

### Data minimization in practice

Temp directories created per job during processing are deleted
(`cleanupTempDir`, `packages/worker/src/lib/tempDir.js`) in a `finally` block
that runs regardless of success or failure, so extracted EPUB contents and
intermediate HTML do not persist on worker disk beyond a single job's
execution.

## Disclaimer — read this before citing this document externally

**The mechanisms above are technical building blocks. They are not, on their
own, legal compliance.** Specifically:

- Nothing in this repository has been reviewed by counsel. No claim is made
  here, or anywhere else in this documentation set, that this platform *is*
  GDPR-compliant, CCPA-compliant, or FERPA-compliant.
- Actual compliance requires, at minimum: a **legal review** of the specific
  data flows for the specific customers/jurisdictions involved; a **Data
  Processing Agreement (DPA)** with any sub-processor whose infrastructure this
  platform's data touches (the S3-compatible storage provider, any hosting
  provider, and — once built — any observability/error-tracking vendor); and,
  depending on customer requirements (FERPA-covered EdTech customers in
  particular, per PRD persona "Bob — EdTech Administrator"), possibly a
  **formal third-party audit**.
- The retention gap noted above (`expires_at` computed but not enforced) means
  the "30-day retention" claim in the source PRD/spec is *not currently true in
  practice* — it's a configured target, not an enforced guarantee. Do not
  represent it as enforced to a customer or auditor until the cleanup job
  exists and is verified.
- No penetration test, security audit, or accessibility (WCAG) audit has been
  performed on this codebase — see `docs/SECURITY.md`.
- This document itself does not constitute a compliance certification, SOC 2
  report, or any other formal attestation. It is an internal engineering
  inventory, intended to give whoever *does* commission a legal/compliance
  review an accurate starting map of what technical controls already exist.
