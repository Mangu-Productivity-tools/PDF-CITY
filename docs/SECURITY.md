# Security

This document lists what is actually implemented in this codebase versus what
is not, so the team (and whoever is funding this build) has an accurate picture
rather than the source spec's aspirational security section restated as fact.

## Implemented

- **Allowlist-based HTML sanitization of EPUB content before rendering.**
  `packages/worker/src/epub/assemble.js` runs every spine document through
  `sanitize-html` with an explicit `allowedTags`/`allowedAttributes` allowlist
  (headings, text formatting, tables, images, basic SVG shapes, etc.) and
  `allowedSchemes: ['http', 'https', 'data']`. Anything not on the allowlist —
  including `<script>`, `<iframe>`, `<object>`, and inline event-handler
  attributes like `onclick` — is discarded
  (`disallowedTagsMode: 'discard'`), not merely escaped. This is covered by a
  test in `packages/worker/tests/epub-pipeline.test.js` that asserts script
  tags, `onclick`, and `<iframe>` are stripped from real fixture output.

- **Bearer API keys, hashed at rest with SHA-256.** `packages/api/src/lib/apiKeys.js`
  stores `sha256(raw_key)` (`hashApiKey`); the raw key is never persisted.
  Lookups re-hash the presented token and match against `api_keys.key_hash`,
  which also has a unique index. Keys additionally support `revoked_at` and
  `expires_at` columns, both checked on every lookup.

- **Rate limiting and per-key concurrency limits.** `express-rate-limit`
  enforces `RATE_LIMIT.REQUESTS_PER_MINUTE` (60/min by default) keyed on
  `req.apiKey.id` (`packages/api/src/middleware/rateLimit.js`); a separate
  `requireConcurrencyHeadroom` check on `POST /convert` caps simultaneous
  non-terminal jobs per key at `MAX_CONCURRENT_JOBS_PER_USER` (10 by default).
  Both return `429` with a `Retry-After` header.

- **HMAC-SHA256-signed webhooks.** Every webhook delivery is signed
  (`packages/shared/src/hmac.js`, `X-Hub-Signature: sha256=<hex>`) using a
  secret generated per job (`crypto.randomBytes(32)` at job-creation time, not
  a single shared secret), so a compromised secret only affects one job's
  callback traffic.

- **Private object storage.** Uploaded EPUBs and rendered PDFs are written with
  server-side encryption (`SSE-AES256`) and are never given a public ACL or
  bucket policy in code — the only way to fetch an object is a signed,
  time-limited URL minted on demand (`getSignedDownloadUrl`,
  `packages/shared/src/storage.js`). Note: this relies on the bucket itself
  defaulting to private (true for MinIO and for AWS S3 with default settings);
  the code does not additionally pass an explicit per-object `ACL` parameter,
  so bucket-level configuration in the deployment layer still matters.

- **`helmet` security headers**, and `X-Powered-By` disabled
  (`packages/api/src/app.js`).

- **No stack traces are ever returned to API clients.** The global error
  handler (`packages/api/src/middleware/errorHandler.js`) logs the full error
  server-side and always responds with a fixed `INTERNAL_ERROR` body for
  anything that isn't a recognized `ApiError` — never `err.message` or
  `err.stack` from an arbitrary exception.

- **DRM-protected EPUBs are rejected, not processed.** `detectDrm()`
  (`packages/worker/src/epub/container.js`) checks for
  `META-INF/encryption.xml` and, if present, the pipeline throws
  `DRM_NOT_SUPPORTED` before any rendering is attempted. This error code is
  treated as non-retryable, so the job fails fast rather than burning retry
  attempts.

- **Basic input validation ahead of processing**: `zod` schemas
  (`packages/shared/src/jobSchema.js`) validate request shape; `file_url` is
  required to be `https://`; multipart uploads are checked for the ZIP magic
  byte header (`PK\x03\x04`/`PK\x05\x06`) before being accepted as an EPUB.

- **SSRF guard on outbound `file_url` fetches.**
  `packages/worker/src/lib/ssrfGuard.js` resolves the target hostname and
  rejects it if any resolved address falls in a loopback, RFC1918, link-local
  (including the `169.254.169.254` cloud metadata endpoint), CGNAT, or
  multicast/reserved range - for both IPv4 and IPv6 (including IPv4-mapped
  IPv6 addresses). Redirects are followed manually, one hop at a time, with
  the same check re-applied to each new Location header, rather than trusting
  `fetch()`'s automatic redirect handling - a redirect to an internal address
  is rejected exactly like a direct request to one. This is **not** a complete
  defense against DNS rebinding: the check resolves the hostname, then lets
  `fetch()` resolve it again to actually connect, so a hostname that's
  configured to answer differently between those two lookups could still slip
  through. Fully closing that requires connecting to the specific IP address
  that was checked (rather than a hostname `fetch()` re-resolves), which is a
  reasonable Phase 2 hardening step - see `docs/RISKS.md`.

## Explicitly not yet implemented

- **Dependency scanning is CI-only, not continuously monitored.** The source
  spec calls for `npm audit` and image scanning (e.g. Trivy) as part of the
  CI/CD pipeline. Even once that CI step exists, it only runs when a pipeline
  runs — there is no scheduled/continuous scan (e.g. Dependabot alerts,
  a nightly job) catching newly-disclosed CVEs in dependencies that aren't
  otherwise touched.
- **No WAF.** There is no web application firewall in front of the API in this
  repository; whatever protection exists is limited to the application-level
  controls listed above plus whatever the deployment layer adds.
- **No penetration test has been performed** on this codebase or any
  environment it's deployed to.
- **No bug bounty program.**
- **No virus/malware scanning of uploaded EPUB files.** The source spec's
  Security Considerations section calls for a ClamAV scan of the EPUB archive
  before processing; there is no such scan anywhere in
  `packages/worker/src/epub/` or `packages/api/src/routes/convert.js` today.
  Untrusted ZIP contents are extracted and parsed directly.
- **Chrome runs with `--no-sandbox`.** `packages/worker/src/engines/chrome.js`
  launches Puppeteer with `--no-sandbox --disable-setuid-sandbox`, per the
  source spec (needed to run headless Chrome inside most containers without
  additional kernel privileges). This trades away Chrome's own OS-level
  sandboxing in favor of relying on the container boundary for isolation —
  a reasonable and common trade-off, but worth knowing about explicitly rather
  than assuming Chrome's sandbox is providing defense-in-depth here.
- **No RBAC / scope enforcement.** `api_keys.scope` (`read`/`convert`) exists
  as a column, and a `requireScope()` middleware is defined
  (`packages/api/src/middleware/auth.js`), but it is not applied to any route
  today — every valid key can currently do everything the API exposes. See
  `docs/ROADMAP.md` Phase 2.

## Where to look for more detail

- `docs/COMPLIANCE.md` — retention/deletion and encryption specifically as they
  relate to GDPR/CCPA/FERPA, plus the explicit disclaimer that none of this
  constitutes legal certification.
- `docs/RISKS.md` — the Calibre-engine and licensing risks, which are security-
  and legal-adjacent but tracked separately since they're about operational/
  licensing exposure rather than attack surface.
