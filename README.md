# EPUB to PDF Conversion Platform

A working core of the platform described in `EPUB_to_PDF_Conversion_Service_Spec_v2.0.md`
and `EPUBtoPDF Conversion Platform Master PRD & Technical Specification v3.docx`
(both under `docs/` in spirit - the originals aren't in this repo, but every
doc here is grounded in them). Submit an EPUB (by URL or upload), it gets
converted to a PDF via headless Chrome or Calibre, and you get back a signed
download link. There's a REST API, a queue-based worker, a Next.js dashboard,
and a deployment layer (Docker/Kubernetes/CI) around that core.

**Read `docs/ROADMAP.md` before assuming anything about scope.** This is
Phase 1 of a much larger PRD - a real, working platform, not the full
enterprise SaaS the PRD envisions (no multi-tenancy, no billing, no admin key
management, no legal compliance certification). `docs/ROADMAP.md` draws that
line explicitly so nobody mistakes one for the other.

## What's actually verified working

Every claim below was checked by actually running the thing, not just reading
the code:

- A live end-to-end smoke test (`scripts/smoke-test.js`) that submits a real
  EPUB fixture through `POST /api/v1/convert`, polls it through the queue and
  worker, and downloads + validates the resulting PDF from S3-compatible
  storage.
- Sanitization is verified against fixture content that deliberately includes
  a `<script>` tag, an `onclick` handler, and an `<iframe>` (all stripped) -
  see `packages/worker/tests/epub-pipeline.test.js`.
- Webhook delivery (HMAC-signed, firing on `completed`/`failed`/`cancelled`),
  the SSRF guard on outbound `file_url` fetches, job listing/download/delete,
  and the two previously-dead API metrics are all covered by
  `scripts/dev-check-endpoints.mjs` and `scripts/dev-check-fixes.mjs`.
- The Next.js frontend builds cleanly (`next build`) and every route was
  curled for a 200 during development.
- The Calibre rendering engine is implemented but **not** verified - Calibre
  isn't installed in the sandbox this was built in. See `docs/RISKS.md` item (a)
  before routing production traffic through `engine=calibre`.
- The Dockerfiles/Kubernetes manifests are written carefully but **untested**
  - no Docker daemon was available in the build sandbox. Build and smoke-test
    them on a real Docker host before deploying.

## Repo layout

```
packages/
  api/       REST API (Express) - packages/api/src, docs/API_CONTRACT.md
  worker/    Queue consumer + EPUB extraction + rendering engines + storage
  web/       Next.js (App Router) dashboard - packages/web/README.md
  shared/    Code shared by api + worker: constants, error codes, zod
             schemas, HMAC signing, the S3-compatible storage client
db/migrations/   Plain-SQL migrations, applied by scripts/migrate.js
infra/           Dockerfiles live in each package; infra/ has k8s manifests,
                 Prometheus alerts, a Grafana dashboard
.github/workflows/  CI: lint, test, npm audit, Docker build + Trivy scan
docs/            API_CONTRACT, ARCHITECTURE, ROADMAP, SECURITY, COMPLIANCE,
                 RISKS, and ADRs - start with ROADMAP.md
scripts/         Migration runner, smoke test, fixture generator, dev-check scripts
```

## Quick start (local dev)

Needs Node 18+, and either Docker (recommended) or local Postgres/Redis/an
S3-compatible store.

```bash
npm install
cp .env.example .env          # defaults match the docker-compose services below

# Bring up Postgres, Redis, and MinIO (S3-compatible storage):
docker compose up -d postgres redis minio minio-createbucket

npm run migrate                # applies db/migrations/*.sql

npm run dev:api                # packages/api,    http://localhost:3000
npm run dev:worker             # packages/worker,  internal health on :3001
npm run dev:web                # packages/web,     http://localhost:3002 (see note below)

node scripts/fixtures/build-sample-epub.js   # writes fixtures/sample.epub
API_KEY=dev-local-key node scripts/smoke-test.js   # exercises the whole pipeline
```

`packages/web`'s dev server runs on port 3002, not 3000, so it doesn't
collide with the API's dev server on the bare host - see
`packages/web/README.md`. In Docker/Kubernetes each service has its own
container, so this isn't a concern there.

`API_KEYS_BOOTSTRAP` in `.env.example` seeds a dev-only API key
(`dev-local-key`) on first boot when `NODE_ENV !== 'production'`. Real key
issuance is direct SQL against `api_keys` for now - see `docs/ROADMAP.md`
Phase 2 for the planned admin endpoint.

If you don't have a Docker daemon available (this repo was built in a
sandbox without one), Postgres/Redis can run as local services and an
S3-compatible endpoint can be simulated with [`s3rver`](https://www.npmjs.com/package/s3rver)
pointed at via `S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` in
`.env` - that's exactly how this was verified end-to-end during development.

## Tests

```bash
npm run test --workspaces --if-present
```

Unit/integration tests are infra-free (no live DB/Redis/S3 needed) and run in
under a second. `scripts/smoke-test.js` and the `scripts/dev-check-*.mjs`
scripts need the stack above running.

## Where to go next

- **`docs/ROADMAP.md`** - what's built, what's next, what was aspirational.
- **`docs/API_CONTRACT.md`** - the authoritative API surface.
- **`docs/ARCHITECTURE.md`** - how the pieces fit together, the job lifecycle.
- **`docs/SECURITY.md`** / **`docs/COMPLIANCE.md`** - honest security/compliance posture.
- **`docs/RISKS.md`** - known gaps, each with a mitigation.
- **`docs/adr/`** - why BullMQ, why two rendering engines, why `/v1` versioning.
- **`CONTRIBUTING.md`** - dev workflow, how to add a migration, PR checklist.

## License

`UNLICENSED` (private) - see `package.json`. Note Calibre is GPLv3-licensed;
see `docs/RISKS.md` item (d) before distributing the worker's Docker image
outside the company.
