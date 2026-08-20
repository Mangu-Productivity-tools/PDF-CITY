# Contributing

## Setup

See the "Quick start" section of `README.md`. Short version: `npm install`,
copy `.env.example` to `.env`, bring up Postgres/Redis/S3-compatible storage
(`docker compose up -d postgres redis minio minio-createbucket`), run
`npm run migrate`, then `npm run dev:api` / `npm run dev:worker` / `npm run dev:web`.

## Code style

Plain JavaScript (ESM, `"type": "module"`), no TypeScript, across every
package including the frontend (`.jsx`, not `.tsx`). Keep it that way unless
the team makes a deliberate, repo-wide decision to add a build step - don't
introduce TypeScript in just one file or package.

No linter is configured yet (`npm run lint --workspaces --if-present` is a
no-op today - every package script is `--if-present` so this doesn't block
anything, but it also means nothing is currently enforcing style
automatically). If you add one (ESLint is the natural choice given the
ecosystem here), wire it into every workspace's `package.json` `lint` script
and into `.github/workflows/ci.yml`'s existing lint step, which already calls
`npm run lint --workspaces --if-present` and will pick it up with no
workflow changes needed.

## Tests

`npm run test --workspaces --if-present` runs everything (`node --test`,
no test framework dependency). Tests should stay infra-free where possible -
`packages/worker/tests/epub-pipeline.test.js` is the model: it exercises the
real extract → parse → sanitize → assemble pipeline against a generated
fixture EPUB (`packages/worker/package.json`'s `pretest` script regenerates
`fixtures/sample.epub` before every run via `scripts/fixtures/build-sample-epub.js`,
so nothing depends on a committed binary). Tests that genuinely need
Postgres/Redis belong behind the same `docker compose up -d` / CI
service-container setup `scripts/smoke-test.js` uses - see that file and
`.github/workflows/ci.yml`'s `services:` block for the pattern.

Before opening a PR that touches `packages/api` or `packages/worker`, run the
full local stack and:

```bash
npm run test --workspaces --if-present
API_KEY=dev-local-key node scripts/smoke-test.js
```

Both must pass. If your change affects webhooks, job cancellation, or
outbound `file_url` fetching, also run `scripts/dev-check-endpoints.mjs` and
`scripts/dev-check-fixes.mjs` - they cover behavior the unit tests don't
(live webhook delivery, the SSRF guard, job list/download/delete).

## Adding a migration

Add a new `db/migrations/NNN_description.sql` file (next number, zero-padded
to match the existing two), then run `npm run migrate`. `scripts/migrate.js`
tracks applied migrations in a `schema_migrations` table and only runs new
ones - never edit a migration that's already been applied anywhere, add a
new one instead.

## Keeping docs honest

`docs/ROADMAP.md`, `docs/SECURITY.md`, `docs/RISKS.md`, and
`docs/ARCHITECTURE.md` describe what's actually implemented, not what the
source PRD/spec proposed. If your change closes a gap one of those documents
calls out (like the SSRF guard and webhook-on-cancel fixes did during the
initial build), update the doc in the same PR rather than letting it go
stale - grep for the relevant keyword across `docs/` first, since a gap is
often mentioned in more than one file (e.g. a security gap shows up in both
`SECURITY.md` and `RISKS.md`).

## API contract changes

`docs/API_CONTRACT.md` is the source of truth for the API shape; the
frontend (`packages/web`) and any external integrations are written against
it. If you change a route's request/response shape, update that file in the
same PR, and check `packages/web/lib/apiClient.js` and
`packages/web/lib/constants.js` for anything that now needs to match
(`packages/web` deliberately doesn't depend on `@epub2pdf/shared` to avoid
pulling AWS SDK weight into the browser bundle, so its constants are
hand-mirrored - see that file's own comment).

## Before opening a PR

- `npm run test --workspaces --if-present` passes.
- If you touched `packages/api` or `packages/worker`: the smoke test passes
  against a real local stack (see "Tests" above).
- If you touched `packages/web`: `npm run build --workspace packages/web`
  succeeds.
- Docs updated if your change closes or introduces a gap tracked in
  `docs/ROADMAP.md`, `docs/RISKS.md`, `docs/SECURITY.md`, or `docs/COMPLIANCE.md`.
- CI (`.github/workflows/ci.yml`) is green: lint, test, `npm audit --audit-level=high`.
