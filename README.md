# pubpdf — Quire studio + EPUB→PDF platform

**Quire** (`packages/studio`) is the free, private PDF studio: merge, split,
watermark, EPUB/Word/Markdown→PDF, booklet imposition, and more. It runs
entirely in the browser and deploys to Vercel. Documents never leave the device.

The rest of this repo is the original conversion platform (API, worker, dashboard).

```bash
npm install
npm run dev:studio    # Quire on http://localhost:3003
```

Vercel: deploy `packages/studio` (project name `quire`). Existing API: `pubpdf-api.vercel.app`.

---

# EPUB to PDF Conversion Platform

A working core of the platform described in the EPUB-to-PDF specs under `docs/`.
Submit an EPUB (by URL or upload), it gets converted to a PDF via headless Chrome
or Calibre, and you get back a signed download link. REST API, queue worker,
Next.js dashboard, Docker/Kubernetes/CI.

**Read `docs/ROADMAP.md` before assuming anything about scope.**

## Repo layout

```
packages/
  studio/    Quire — client-side PDF studio (Vercel)
  api/       REST API (Express)
  worker/    Queue consumer + EPUB pipeline
  web/       Next.js dashboard for the conversion API
  shared/    Shared constants, schemas, storage client
db/migrations/
infra/
.github/workflows/
docs/
scripts/
```

## Quick start

```bash
npm install
npm run dev:studio              # Quire, http://localhost:3003

# Heavy conversion stack
cp .env.example .env
docker compose up -d postgres redis minio minio-createbucket
npm run migrate
npm run dev:api                 # http://localhost:3000
npm run dev:worker
npm run dev:web                 # http://localhost:3002
```

## License

`UNLICENSED` (private) — see `package.json`.
