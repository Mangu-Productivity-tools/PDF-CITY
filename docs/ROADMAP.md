# Roadmap

This roadmap has three phases. Phase 1 is what exists in this repository today.
Phase 2 is near-term engineering work the team has identified as necessary before
this is production-hardened. Phase 3 restates the long-term vision from the v3
PRD (`EPUB to PDF Conversion Platform Master PRD & Technical Specification v3.0`)
for context — it is not a commitment, and most of it has not been scoped.

A note on the PRD's business targets up front: v3 §4 states goals like "launch
v1.0 within 3 months," "onboard at least five enterprise customers within 6
months," and "process 10,000 conversions/month per tenant." Those were
**aspirational business goals written by whoever authored the PRD**, not
engineering commitments made by this build. Nothing in this codebase tracks
against those numbers, no capacity planning has been done to validate them, and
this document does not restate them as deliverables. Where this roadmap uses the
PRD's feature language (e.g. "Conversion Hub"), it's citing the source document,
not asserting the team has agreed to build it on any particular timeline.

## Phase 1 — Built (this repository, today)

A working core conversion platform, single-tenant in practice (one flat
`api_keys` table, no tenant/organization concept):

- **REST API** (`packages/api`) implementing the endpoints in
  `docs/API_CONTRACT.md`: `POST /convert` (URL or multipart), `GET /status/{id}`,
  `GET /jobs` (paginated, filterable), `GET /jobs/{id}/download`,
  `DELETE /jobs/{id}`, `PUT /jobs/{id}` (options update while queued), plus
  `/health`, `/ready`, `/metrics`.
- **Queue-based worker** (`packages/worker`) running the full conversion
  pipeline (download → extract → parse OPF → sanitize/assemble HTML → render →
  upload → notify) on BullMQ/Redis, with a documented state machine — see
  `docs/ARCHITECTURE.md`.
- **Two rendering engines**, selectable per job:
  - **Chrome (Puppeteer)** — verified working end-to-end via a live smoke test
    (`scripts/smoke-test.js`) that converted a real EPUB fixture to a real PDF
    through the entire pipeline.
  - **Calibre CLI** — implemented (`packages/worker/src/engines/calibre.js`),
    but Calibre is not installed in this dev sandbox, so it has never been
    executed against a real binary. See `docs/RISKS.md` item (a).
- **PostgreSQL schema and migrations** (`db/migrations/`) — `api_keys`,
  `conversion_jobs`, `conversion_logs`, `webhook_attempts`, `audit_log`.
- **Redis/BullMQ job queue** with retries (5 attempts, exponential backoff) and
  a separate queue for webhook delivery.
- **S3-compatible object storage** (AWS S3 or MinIO) with server-side
  encryption and signed, time-limited download URLs — no public object access.
- **Webhooks** with HMAC-SHA256 signing (per-job secret) and retry/backoff on
  delivery failure, firing on all three terminal states (`completed`, `failed`,
  and `cancelled` - cancellation is notified directly by the API the moment a
  `DELETE` cancels a job, not just by the worker).
- **SSRF guard on outbound `file_url` fetches** (`packages/worker/src/lib/ssrfGuard.js`) —
  rejects hosts that resolve to loopback/RFC1918/link-local/metadata-endpoint
  addresses, re-validated on every redirect hop. Not a complete defense against
  DNS rebinding (that needs connecting to a pinned resolved IP rather than
  letting `fetch()` re-resolve) - see `docs/SECURITY.md` and `docs/RISKS.md`.
- **Rate limiting and per-API-key concurrency limits** on the API.
- **Bearer API-key authentication** — keys are hashed (sha256) at rest. This is
  **not** OAuth2 and **not** a role-based access control system. There is a
  `scope` column (`read`/`convert`) and a `requireScope` middleware exists in
  code, but it isn't wired into any route yet, so it isn't enforced. Keys are
  currently seeded directly into the database (`bootstrapDevKeys`, dev-only, or
  manual SQL); **there is no admin API-key-management endpoint yet** — see
  Phase 2.
- **Next.js frontend** (`packages/web`) covering Dashboard, Upload, Jobs List,
  Job Detail, and Settings screens — being built in parallel by a separate
  workstream; not detailed in this document.
- **Docker/Kubernetes/CI deployment layer** (`infra/`, `.github/`) — also being
  built in parallel by a separate workstream; not detailed in this document.

Explicitly **not** built in Phase 1 (do not read any other part of this
documentation set as implying otherwise):

- Multi-tenancy or per-tenant data isolation (jobs are scoped to an
  `api_key_id`, not to an organization/tenant).
- Payment or billing integration.
- An admin UI or API for issuing/revoking/rotating API keys.
- OAuth2 or any RBAC beyond the unused `scope` column noted above.
- Real, wired-up Sentry/Datadog integration — the env vars (`SENTRY_DSN`,
  `DATADOG_API_KEY`) exist as placeholders in `.env.example`; nothing in the
  code initializes either SDK.
- FERPA/CCPA/GDPR legal compliance certification. Technical building blocks
  exist (an `audit_log` table, a 30-day retention policy expressed as
  `OBJECT_RETENTION_DAYS` + `expires_at`), but that is not the same thing as
  legal sign-off — see `docs/COMPLIANCE.md`.
- 24x7 support operations.
- True multi-AZ disaster recovery infrastructure.
- Support for any format beyond EPUB → PDF.

## Phase 2 — Near-term hardening

Work needed to take Phase 1 from "working core platform" to "something you'd
put in front of paying enterprise customers unsupervised":

- **Admin API key management** — an authenticated endpoint (or, at minimum, a
  CLI) to generate, list, revoke, and rotate API keys, replacing direct SQL
  seeding. `docs/API_CONTRACT.md` already reserves `/api/v1/api-keys` for this.
- **OAuth2**, if/when a customer integration requires it beyond bearer keys.
- **Real observability wiring** — actually initialize Sentry/Datadog (or an
  equivalent) instead of leaving the DSN/API-key env vars unused; forward
  structured logs to an aggregator. (The API's `http_request_duration_seconds`
  and `conversion_jobs_started_total` metrics are now live as of Phase 1 — see
  `docs/ARCHITECTURE.md` — this bullet is about Sentry/Datadog/log-aggregation
  specifically, not those two.)
- **Harden the Calibre engine** — run it against a real Calibre install,
  confirm the CLI flag names for the actual installed version (they were
  transcribed from the source spec, not tested — see `docs/RISKS.md` item a),
  and add it to CI/integration tests.
- **Continuous dependency scanning** — move from CI-only `npm audit`/image
  scanning to an ongoing/scheduled check (e.g. Dependabot or equivalent) — see
  `docs/SECURITY.md`.
- **Automate the retention/deletion policy** — `expires_at` is computed and
  stored correctly on job completion, but nothing currently sweeps expired
  rows/objects; `db/migrations/002_logs_and_webhooks.sql` references a
  `scripts/cleanup.js` (implemented; see `docs/OPERATIONS.md` § Data Retention).
  See `docs/COMPLIANCE.md`.
- **Additional formats** — the PRD's Phase 2/3 language (DOCX, HTML) beyond
  EPUB → PDF. Not started; would require new extraction/assembly logic per
  format, not just a new rendering engine.
- **Close known implementation gaps** found while writing this documentation:
  `MAX_PAGE_COUNT` and `MAX_FONT_SIZE_MB` are defined in
  `packages/shared/src/constants.js` but never enforced anywhere in the
  pipeline; `file_url` fetches in the worker are restricted to `https://` but
  not otherwise validated against internal/private network ranges.

## Phase 3 — The PRD's long-term vision

This is the v3 PRD's own framing (§2 Vision, §17 Roadmap), carried forward here
for planning context, not as a commitment:

- **Multi-tenancy** — proper tenant/organization model with data isolation,
  beyond today's single flat `api_keys` table.
- **Payment/monetization** — billing integration, usage metering, plans/tiers.
- An expanded **"Conversion Hub"** beyond EPUB → PDF — the PRD's vision of a
  general-purpose document conversion service (DOCX, HTML, and others) that
  this platform's engine-plugin architecture (`packages/worker/src/engines/`)
  was deliberately designed to accommodate (see
  `docs/adr/0001-rendering-engine-choice.md`), but that accommodation is
  architectural headroom, not a scoped project.
- Full production disaster-recovery posture: multi-AZ deployment, RTO/RPO
  targets (the PRD cites RTO ≤ 1h, RPO ≤ 15min in §21) — none of which has
  infrastructure behind it yet.
- 24x7 support operations.
- Formal legal compliance certification (GDPR/CCPA/FERPA) — see the
  disclaimer in `docs/COMPLIANCE.md`.

Nothing in Phase 3 has been scoped into tickets, estimated, or scheduled. It's
listed here so the gap between "what the original PRD envisioned" and "what
Phase 1 actually delivers" is visible to whoever is planning the next phase of
work or funding it.
