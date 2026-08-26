# Risks

Technical risks in the current build, each with a brief mitigation. These are
risks in the code and its operational context as it exists today, not a
restatement of the source PRD's risk *categories* — where a PRD risk is still
relevant, it's carried forward with specifics grounded in this codebase.

## (a) Calibre CLI flags have never been executed against a real Calibre binary

`packages/worker/src/engines/calibre.js` builds an `ebook-convert` command line
(`--paper-size`, `--margin-left/right/top/bottom`, `--pdf-add-toc`,
`--enable-heuristics`, `--no-chapters-in-toc`) transcribed directly from the
source spec's "Rendering Engines > Calibre" section. Calibre is not installed
in this dev sandbox, so none of these flags have been verified against an
actual Calibre release. Calibre's own CLI flag names have changed across major
versions historically (the code comment specifically flags that some versions
use `--pdf-page-margin-left` etc. instead of `--margin-left`), so there is a
real chance the current flags are simply wrong for whatever Calibre version
ends up installed in a real environment.

**Mitigation**: `isCalibreAvailable()` (`packages/worker/src/engines/calibre.js`)
already checks for the binary at worker startup and logs a clear warning if
Calibre-engine jobs will fail. Before relying on the Calibre engine in
production: install the target Calibre version, run
`ebook-convert dummy.epub dummy.pdf -h` against it, diff the real flag names
against what's hardcoded here, and add an integration test (parallel to the
existing Chrome smoke test) that actually exercises this path end-to-end. Until
that happens, treat "Calibre engine" as implemented-but-unverified, not
production-ready — see `docs/ROADMAP.md` Phase 2.

## (b) Kubernetes HPA queue-length scaling needs a cluster add-on that may not be present

The source spec calls for a `HorizontalPodAutoscaler` scaling on an external
metric, `redis_queue_length` (target 1000), in addition to CPU. Kubernetes does
not support scaling on an arbitrary external metric out of the box — it
requires a metrics adapter (commonly **KEDA** or the **Prometheus Adapter**)
installed as a cluster add-on to expose that Redis/BullMQ queue depth as a
metric the HPA can read. The `infra/` deployment layer is being built by a
separate workstream and, as of this writing, contains no Kubernetes manifests
yet, so this can't yet be verified either way for the target cluster.

**Mitigation**: confirm KEDA (or Prometheus Adapter) is installed and
configured before wiring up queue-based autoscaling; a CPU-utilization-only HPA
is a safe fallback that works without any add-on if the target cluster doesn't
have one. Flag this explicitly to whoever owns the `infra/` workstream.

## (c) Chrome/Puppeteer version drift breaking rendering output over time

The Chrome engine (`packages/worker/src/engines/chrome.js`) uses
`puppeteer-core` (`^25.0.0` in `packages/worker/package.json` — a caret range,
so `npm install` can pick up newer minor/patch versions over time) to drive a
Chromium binary supplied externally via `PUPPETEER_EXECUTABLE_PATH`/
`CHROME_PATH`. Because `puppeteer-core` never bundles or manages the browser
itself, the actual Chromium version running in any given environment is
whatever the container image happens to have installed, entirely decoupled
from the `puppeteer-core` npm version. Chrome's print-to-PDF behavior,
`headerTemplate`/`footerTemplate` rendering, and CSS `@page`/print-media
support have all changed subtly across Chrome releases historically — a
Chromium upgrade (or a `puppeteer-core` upgrade that changes CDP protocol
assumptions) can silently change PDF output (pagination, margins, font
rendering) without any code change here to explain it.

**Mitigation**: pin an exact Chromium build in the worker's container image
rather than tracking "latest" (an `infra/` workstream concern); add
golden-file/visual-regression tests against the sample fixture's rendered PDF
so a version bump that changes output is caught in CI rather than in
production; treat Chromium upgrades as a reviewed, deliberate change rather
than an incidental side effect of an unrelated image rebuild.

## (d) Calibre is GPLv3-licensed — bundling it carries real obligations

Calibre is distributed under GPLv3. If the worker's Docker image bundles the
Calibre binary (as the source spec's Dockerfile section assumes — "Install
Calibre via PPA or official script"), that image is subject to GPLv3's
obligations (notably source-availability/copyleft requirements) for whatever
is distributed alongside it. This matters more the more widely the resulting
image is distributed (e.g., pushed to a public registry, handed to a customer
for self-hosting) versus run purely as an internal service. The current
integration pattern — invoking `ebook-convert` as a separate CLI subprocess via
`child_process.execFile`, not linking against Calibre's libraries — is a lower-
risk integration shape than static/dynamic linking, but that alone does not
resolve the licensing question for the container image as a distributable
artifact.

**Mitigation**: a licensing review before this image is distributed outside the
company (or before Calibre-engine support is marketed as a differentiator to
customers who'd receive the image), specifically scoped to how the image is
distributed and to whom. Document the GPLv3 notice/attribution requirements
alongside the Dockerfile once it exists. This was already flagged as a
dependency in the source spec (§20, §15) and PRD (§15) — it needs an actual
legal answer, not just a citation, before wide distribution.

## (e) Other operational risks carried forward from the source spec

- **S3 storage cost growth.** Every completed job leaves a PDF (and, for
  multipart submissions, the original EPUB) in storage. `OBJECT_RETENTION_DAYS`
  (30 by default) and `expires_at` exist to bound this, but as documented in
  `docs/COMPLIANCE.md`, nothing currently sweeps expired objects/rows —
  `scripts/cleanup.js`, referenced in a migration comment, does not
  exist yet. Left unaddressed, storage cost grows unbounded with job volume
  rather than plateauing at a 30-day rolling window. **Mitigation**: build the
  retention sweep job before this goes to meaningful production volume; it's
  already tracked in `docs/ROADMAP.md` Phase 2.

- **Worker OOM on very large EPUBs.** `MAX_EPUB_SIZE_MB` (100MB default) is
  enforced at upload time (`multer`'s `fileSize` limit in
  `packages/api/src/routes/convert.js`), but `MAX_PAGE_COUNT` (2000) and
  `MAX_FONT_SIZE_MB` (10) are defined in `packages/shared/src/constants.js` and
  are **not enforced anywhere in the pipeline** — nothing currently checks
  spine length, page count, or embedded font size before handing a file to
  Chrome or Calibre. A 100MB EPUB that is mostly high-resolution images or has
  an unusually large spine can still cause the rendering engine to consume
  large amounts of memory, and the worker has no per-job memory ceiling of its
  own beyond whatever the container/process limits impose. **Mitigation**:
  enforce `MAX_PAGE_COUNT`/`MAX_FONT_SIZE_MB` (or an equivalent heuristic, e.g.
  total extracted-content size) before rendering; set container memory limits
  and let Kubernetes OOM-kill and restart the worker pod as a backstop (BullMQ
  will pick the job back up as a retry, bounded by `JOB_ATTEMPTS`); consider a
  per-job timeout tighter than the current 10-minute Chrome / 20-minute
  Calibre ceilings for pathological inputs.

- **`file_url` fetches are now IP-range-restricted, but not fully closed
  against DNS rebinding.** `packages/worker/src/lib/ssrfGuard.js` rejects
  hostnames that resolve to loopback/RFC1918/link-local/metadata/CGNAT/
  multicast addresses, re-checked on every redirect hop - see
  `docs/SECURITY.md` for what this covers. The residual gap: the check
  resolves the hostname once to validate it, then `fetch()` resolves it again
  to actually connect, so a host that answers a public IP on the first lookup
  and a private one on the second (classic DNS rebinding) could still slip
  through. Closing that fully means connecting to the specific IP that was
  checked rather than letting `fetch()` re-resolve the hostname - not done
  here. Separately, from an operational (not just security) angle: an
  unbounded or slow-responding public URL still ties up a worker slot until
  the download step's implicit timeout is reached; there's no dedicated
  per-download timeout independent of the overall job timeout today.
