# ADR 0001: Support both Chrome (Puppeteer) and Calibre as pluggable rendering engines

## Status

Accepted. Implemented in `packages/worker/src/engines/`.

## Context

The worker needs to turn an assembled, sanitized HTML document (the combined
EPUB spine, per `packages/worker/src/epub/assemble.js`) into a PDF. Both the
source spec (v2.0, "Rendering Engines") and the PRD (v3 §7.6, "Support Chrome &
Calibre engines via option") specify supporting two engines, selectable
per-job:

- **Headless Chrome**, via its native print-to-PDF capability, driven by
  Puppeteer.
- **Calibre**, via its `ebook-convert` command-line tool.

These two engines have different strengths. Chrome's rendering engine handles
modern CSS (flexbox, `@font-face`, complex layouts) and gives pixel-accurate
control over headers/footers and pagination via Chrome's own print CSS
support, at the cost of a full browser process's memory footprint. Calibre is
purpose-built for ebook conversion, tends to use less memory for
straightforward EPUBs, and has its own table-of-contents generation — but has
less faithful CSS3 support and its CLI flag surface varies across releases.
Neither is a strict superset of the other for the range of EPUBs this service
needs to accept.

## Decision

Implement both engines behind a single, minimal interface —
`render(engineName, { htmlPath, outputPdfPath, options })` in
`packages/worker/src/engines/index.js` — and select between them per job via
`options.engine` (`"chrome"` default, or `"calibre"`), validated by
`packages/shared/src/jobSchema.js` and stored on the `conversion_jobs.engine`
column.

- `packages/worker/src/engines/chrome.js` — `puppeteer-core` driving an
  externally-supplied Chromium binary (`PUPPETEER_EXECUTABLE_PATH`/
  `CHROME_PATH`); `page.pdf()` with `format`, `margin`,
  `headerTemplate`/`footerTemplate`, a 10-minute timeout.
- `packages/worker/src/engines/calibre.js` — shells out to `ebook-convert` via
  `child_process.execFile`, with a 20-minute timeout and a 2GB `maxBuffer`.

Both engines throw the same `WorkerError` shape (`RENDER_CHROME_FAILED` /
`RENDER_CALIBRE_FAILED` / `TIMEOUT`) so the rest of the pipeline
(`processConversionJob.js`) doesn't need to know which engine ran.

## Consequences

**Positive:**

- Callers can pick the engine that fits their content and cost profile
  (`docs/API_CONTRACT.md`'s `options.engine`), rather than the platform
  forcing one choice.
- The common interface (`ENGINES` map + `render()`) means adding a third engine
  later is a matter of implementing one function with the same signature — this
  is deliberately the architectural seam the PRD's longer-term "Conversion Hub"
  vision (additional output formats, `docs/ROADMAP.md` Phase 3) would build on,
  though no work toward that has been scoped.
- If one engine has a systemic problem (e.g. the Calibre flag-name risk below),
  the other remains a working fallback rather than the whole service being down.

**Negative / accepted trade-offs:**

- Two rendering code paths means two things to test, monitor, and keep working
  across upgrades. Only the Chrome path has been verified end-to-end so far
  (`scripts/smoke-test.js`); the Calibre path is implemented but unverified
  against a real Calibre binary in this environment — see
  `docs/RISKS.md` item (a). This is a direct consequence of choosing to ship
  both engines rather than deferring Calibre until it could be tested.
- Calibre is GPLv3-licensed; bundling its binary into the worker's container
  image carries GPLv3 obligations that need a licensing review before wide
  distribution — see `docs/RISKS.md` item (d). Choosing to support Calibre at
  all is what introduces this obligation.
- Chrome's own version (decoupled from the `puppeteer-core` npm package, since
  the binary is supplied externally) can drift and silently change rendering
  output — see `docs/RISKS.md` item (c). This risk is inherent to using a full
  browser as a rendering engine at all, not specific to this implementation.
