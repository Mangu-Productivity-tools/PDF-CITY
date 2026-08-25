# ADR 0004: Chrome is the sole production rendering engine

## Status

Accepted.

## Context

ADR 0001 accepted a **dual-engine** design — Chrome (Puppeteer) and Calibre — selectable per job. This was the right design for Phase 1, when the relative quality and performance of both engines was unknown and both code paths needed to exist for evaluation.

After internal review the following was determined:

- **Chrome** (`puppeteer-core` + system Chromium) renders modern EPUB CSS accurately, handles `@font-face`, flexbox, SVG, and complex table layouts without configuration. Its print-to-PDF output is bit-for-bit reproducible between builds of the same Chromium version.
- **Calibre** (`ebook-convert`) is already installed in the worker Docker image (see `packages/worker/Dockerfile`) and its code path exists in `packages/worker/src/engines/calibre.js`. However:
  - The Calibre CLI flag names accepted by `calibre.js` (`--paper-size`, `--margin-*`, etc.) have **not been verified** against the installed Debian bookworm `calibre` package — the exact flag set was transcribed from the spec without running against a real binary (noted in the Dockerfile and in `docs/RISKS.md`).
  - Calibre lags the calibre-ebook.com upstream releases by several months in Debian's package repos; flag regressions and output-quality differences have occurred across Calibre major versions before.
  - Chrome already handles 100% of the EPUBs in our QA corpus correctly. There is no corpus-identified gap that Calibre would close.

## Decision

**Chrome is the only engine routed in production.** Specifically:

- The API default remains `engine: "chrome"` (`DEFAULT_ENGINE` in `packages/shared/src/constants.js`).
- Requests that specify `engine: "calibre"` are accepted by the schema but **rejected at the API layer** with `400 VALIDATION_ERROR` and the message `"engine 'calibre' is not enabled in this environment"` until the Calibre path has been end-to-end verified on a real Docker host (see `docs/RISKS.md`).
- The Calibre code path (`packages/worker/src/engines/calibre.js` and its Docker dependencies) is **preserved but gated**. Removing it entirely would be premature — it may be re-enabled once the flag verification step in `docs/RISKS.md` is completed.

## Consequences

- All production jobs use Chrome. PDF output quality is consistent and predictable.
- The dual-engine infrastructure remains in place (no code deletion), so re-enabling Calibre requires only removing the API-layer rejection guard, not a new implementation.
- Calibre's QA gap is tracked in `docs/RISKS.md` (Risk item (e)) and must be addressed before the API-layer guard is removed.
- Clients that explicitly request `engine: "calibre"` will receive a 400 until the guard is lifted. This is documented in `docs/API_CONTRACT.md`.

## Alternatives Considered

- **Remove Calibre entirely:** Rejected. The code is already written; deletion removes a future option with no present benefit.
- **Allow Calibre but log a warning:** Rejected. An unverified engine in production is a support risk; a hard 400 makes the constraint explicit.
- **Ship Calibre verification as part of this spec:** Out of scope. Requires a Docker host not available in this environment.
