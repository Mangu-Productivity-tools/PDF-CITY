# @epub2pdf/web

Next.js (App Router, plain JavaScript) frontend for the EPUB-to-PDF Conversion
Platform. Talks to `packages/api` per `docs/API_CONTRACT.md`; every call goes
through `lib/apiClient.js`, which attaches the API key you paste into
**Settings** (stored in `localStorage`, Phase 1 has no login system) as
`Authorization: Bearer <key>`.

## Screens

| Route | Purpose |
| --- | --- |
| `/` | Dashboard — recent conversions + a quick-upload widget |
| `/upload` | Drag-and-drop / file picker / paste-a-URL, full options panel |
| `/jobs` | Table of conversions — search, status filter, sort, pagination |
| `/jobs/[id]` | Job detail — metadata, progress, download, cancel, errors |
| `/settings` | API key, theme toggle, notification-preferences placeholder |

## Running locally

From the **monorepo root** (this is an npm workspace):

```bash
cp packages/web/.env.example packages/web/.env.local   # then edit if needed
npm install                                             # once, at repo root
npm run dev --workspace packages/web                    # http://localhost:3002
```

The dev server runs on **port 3002** (`next dev -p 3002`), not 3000 — on a
bare host, `packages/api`'s dev server already listens on 3000
(`API_PORT` in `.env`), so this avoids a collision. This only matters for
local/bare-host dev; in Docker/Kubernetes each service has its own container,
so `next start` listening on 3000 inside its own container (below) is normal.

By default the app talks to `http://localhost:3000` (see
`.env.example` / `NEXT_PUBLIC_API_BASE_URL`). Point it at wherever
`packages/api` is actually running.

To build and run the production server directly (no Docker):

```bash
npm run build --workspace packages/web
npm run start --workspace packages/web   # http://localhost:3000
```

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Base URL of `packages/api`, no trailing slash. Browser-visible — inlined into the client bundle at **build** time, not read at container start. |

The API key itself is **not** an env var — it's entered on `/settings` and
kept client-side in `localStorage` (key: `epub2pdf:apiKey`).

## Docker

Build from the **repo root** (the Dockerfile needs the shared workspace
lockfile):

```bash
docker build -f packages/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -t epub2pdf-web .

docker run -p 3000:3000 epub2pdf-web
```

Because `NEXT_PUBLIC_API_BASE_URL` is baked in at build time, changing it
means rebuilding the image (a plain `docker run -e NEXT_PUBLIC_API_BASE_URL=...`
has no effect on an already-built image).

## Notes

- **Polling**: `/jobs/[id]` polls `GET /status/{job_id}` every ~5s while the
  job is `queued`/`processing` and stops automatically on a terminal status
  (`completed`/`failed`/`cancelled`) — see `lib/useJobPolling.js`.
- **Accessibility**: keyboard-navigable forms, a labeled `role="progressbar"`,
  `aria-live` status/toast regions, skip-to-content link, and Tailwind color
  pairings chosen for ≥4.5:1 contrast in both themes.
- **Theme**: a small inline script in `app/layout.jsx` applies the saved
  theme (`localStorage` key `epub2pdf:theme`, falling back to
  `prefers-color-scheme`) before hydration to avoid a flash of the wrong
  theme; toggle it from the nav sidebar or Settings.
- **`@epub2pdf/shared` is intentionally not a dependency here.** Its barrel
  export (`packages/shared/src/index.js`) re-exports `storage.js`, which
  pulls in the AWS S3 SDK — server/Node-only weight we don't want traced into
  the browser bundle. The handful of wire constants we need (statuses, engine
  and page-size enums, option defaults) are mirrored by hand in
  `lib/constants.js`, matching `docs/API_CONTRACT.md` and
  `packages/shared/src/constants.js` / `jobSchema.js`.
