# syntax=docker/dockerfile:1
#
# packages/worker/Dockerfile
#
# NOTE - UNTESTED IN THIS SANDBOX: the Docker CLI is present here but the
# daemon cannot start (sandbox restriction - `service docker start` fails on
# a ulimit permission error), so this file has never actually been through
# `docker build`. It was authored carefully against the real
# packages/worker/package.json + packages/worker/src, but please build and
# smoke-test it on a real Docker host before deploying - see the CALIBRE
# note further down for a specific, known-risky area to verify first.
#
# Multi-stage Node 20 image for @epub2pdf/worker. Unlike the API, this
# service needs a real browser (headless Chromium, driven by puppeteer-core
# - see packages/worker/src/engines/chrome.js, which never downloads its own
# browser) and, optionally, Calibre's `ebook-convert` CLI (see
# packages/worker/src/engines/calibre.js) on the PATH at runtime.
#
# Base image: Debian (node:22-slim) - deliberately NOT Alpine and NOT a
# plain Ubuntu image:
#   - Alpine: musl libc + apk package names don't line up with the
#     Puppeteer runtime-dependency list this Dockerfile installs below
#     (libnss3, libatk-bridge2.0-0, etc. are Debian/Ubuntu package names),
#     and prebuilt Chromium binaries have a history of missing-symbol
#     crashes on musl.
#   - Ubuntu: recent Ubuntu releases replaced the `chromium` *apt* package
#     with a transitional stub that just pulls in the Snap version, which
#     does not run inside a plain Docker container (no snapd). Debian -
#     what node:22-slim is actually built on - still ships a real ELF
#     binary via `apt-get install chromium`, which is what we rely on here.
#
# Build context for this image is expected to be the REPO ROOT, e.g.:
#   docker build -f packages/worker/Dockerfile .
#
# Node 22 Active LTS (until 2027-04-30). See packages/api/Dockerfile for
# upgrade notes if moving to Node 24.

# ---------------------------------------------------------------------------
# Stage 1: install only this service's + packages/shared's dependencies
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./

# See packages/api/Dockerfile for a longer explanation of why all four
# workspace package.json files are copied here even though only
# worker+shared's dependencies actually get installed (--workspace below
# scopes the real install; the extra COPYs just satisfy `npm ci`'s
# lockfile-sync check, which wants every workspace to have a package.json
# on disk). This keeps api's/web's dependency trees out of this image.
COPY packages/worker/package.json packages/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci \
      --workspace packages/worker \
      --workspace packages/shared \
      --omit=dev \
      --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: bring in the actual source
# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages/worker/src packages/worker/src
COPY packages/shared/src packages/shared/src

# ---------------------------------------------------------------------------
# Stage 3: runtime image - Chromium + Calibre + Node, non-root
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app

# --no-install-recommends keeps this from ballooning further than it
# already will (Chromium + Calibre are both sizeable). The list below is:
#   - chromium             the actual browser puppeteer-core launches
#                           (CHROME_PATH / PUPPETEER_EXECUTABLE_PATH below)
#   - calibre               provides `ebook-convert` for the optional
#                           `calibre` render engine - see the NOTE below
#                           before relying on this in production
#   - tini                  minimal init; becomes PID 1 (ENTRYPOINT) so
#                           zombie Chromium/ebook-convert child processes
#                           get reaped and SIGTERM from `kubectl delete
#                           pod` / a rolling deploy is forwarded correctly
#                           (plain `node` as PID 1 does neither)
#   - curl, ca-certificates only for the HEALTHCHECK below and general TLS
#                           trust (S3 calls, webhook delivery, etc.)
#   - fonts-liberation      metric-compatible with Arial/Times/Courier, so
#                           PDFs of EPUBs using those common fonts don't
#                           silently fall back to a missing-glyph box font
#   - everything else       Puppeteer's own documented list of Debian/Ubuntu
#                           runtime dependencies for headless Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      calibre \
      tini \
      curl \
      ca-certificates \
      fonts-liberation \
      libnss3 \
      libatk-bridge2.0-0 \
      libcups2 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxtst6 \
      libgtk-3-0 \
      libgbm1 \
      libasound2 \
      libx11-xcb1 \
      libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# NOTE ON CHROMIUM VERSION PINNING (docs/RISKS.md item (c), written by the
# docs/ workstream, explicitly flags this as "an infra/ workstream concern"):
# `apt-get install chromium` above pulls whatever version is current in
# Debian bookworm's repos AT BUILD TIME, un-pinned - rebuilding this image
# next month can silently ship a different Chromium than today's, and
# Chrome's print-to-PDF/CSS print-media behavior has changed across releases
# before (see chrome.js's page.pdf() call). This was left un-pinned here
# because verifying a real, currently-available exact `chromium=<version>`
# string for Debian bookworm needs apt/network access this sandbox doesn't
# have, and guessing wrong would break the build outright (worse than the
# status quo). Two real options once you have a Docker host to verify on:
#   1. Pin the apt package: run `apt-cache madison chromium` on a real
#      Debian bookworm host/container to get an exact version string, then
#      `apt-get install -y chromium=<that string>` (add `apt-mark hold
#      chromium` too, so nothing else silently upgrades it later).
#   2. Switch to Google's Chrome for Testing builds, which exist specifically
#      for reproducible/automated use and are versioned+downloadable
#      directly (no apt/distro dependency) - e.g., as of this writing,
#      https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json
#      resolves to Stable 152.0.7977.54 with a working linux64 build at
#      https://storage.googleapis.com/chrome-for-testing-public/152.0.7977.54/linux64/chrome-linux64.zip
#      (verified reachable, HTTP 200, ~194MB, from this sandbox while writing
#      this file - re-check before using, versions roll frequently). This
#      still needs every apt-installed shared library above (Chrome for
#      Testing ships the browser only, not its runtime .so dependencies), so
#      it'd add a `curl | unzip` step and change CHROME_PATH /
#      PUPPETEER_EXECUTABLE_PATH to wherever it's extracted, not remove
#      anything from the apt-get list above.
# Not switched to option 2 here by default because it's a bigger structural
# change than this task's brief called for (which explicitly suggested
# `apt-get install -y chromium` as the approach) and adds an untested (from
# this sandbox) download+unzip step on top of an already-untested Dockerfile;
# flagging with a concrete, verified starting point instead so whoever picks
# this up doesn't have to research it from scratch.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# NOTE ON CALIBRE (please read before enabling engine=calibre in prod):
#
# The `ebook-convert` CLI flags packages/worker/src/engines/calibre.js
# passes (--paper-size, --margin-left/right/top/bottom, --pdf-add-toc,
# --enable-heuristics, --no-chapters-in-toc) were transcribed from the
# source spec, not verified against a real Calibre binary - Calibre isn't
# available in the dev sandbox this repo was built in (see the comment at
# the top of calibre.js and docs/RISKS.md). Debian bookworm's `calibre` apt
# package (installed above) also tends to lag a few point releases behind
# calibre-ebook.com's own installer, and margin/TOC flag names have changed
# across Calibre major versions before.
#
# Before routing production traffic through engine=calibre:
#   1. Build this image somewhere with a working Docker daemon.
#   2. Sanity-check the installed version and flags, e.g.:
#        docker run --rm <image> ebook-convert --version
#        docker run --rm <image> ebook-convert dummy.epub dummy.pdf -h | less
#      and diff the margin/TOC flag names against calibre.js.
#   3. Run one real EPUB through engine=calibre end-to-end (see
#      scripts/smoke-test.js) and open the resulting PDF before trusting it.
# If the apt-packaged version's flags have drifted from what calibre.js
# sends, either update calibre.js (outside this Dockerfile's scope) or swap
# this apt install for Calibre's official installer script, which tracks
# upstream releases more closely than Debian's package:
#   RUN curl -fsSL https://download.calibre-ebook.com/linux-installer.sh \
#         | sh /dev/stdin
# ---------------------------------------------------------------------------

ENV CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CALIBRE_PATH=/usr/bin/ebook-convert \
    NODE_ENV=production \
    TEMP_DIR=/tmp/epub2pdf \
    HOME=/tmp

# Official node:*-slim images ship a pre-created, unprivileged `node`
# user/group (uid/gid 1000). TEMP_DIR above, and Chromium's own scratch
# space (chrome.js passes --disable-dev-shm-usage, which redirects its
# /dev/shm usage - normally capped at a tiny 64MB by Docker's default - to
# $TMPDIR/tmp instead) both live under /tmp, so it must stay writable even
# when infra/k8s's SecurityContext sets readOnlyRootFilesystem: true (that
# Deployment mounts an emptyDir at /tmp for exactly this reason). HOME=/tmp
# similarly sends Calibre's ~/.config/calibre and ~/.cache/calibre onto that
# same writable volume instead of the (read-only in prod) home directory.
RUN mkdir -p /tmp/epub2pdf && chown -R node:node /app /tmp

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/worker ./packages/worker
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared

USER node

# No public HTTP port - only the internal health/metrics server
# (packages/worker/src/healthServer.js: GET /health, /ready, /metrics,
# WORKER_HEALTH_PORT, default 3001).
EXPOSE 3001

# See the api Dockerfile's HEALTHCHECK comment - Kubernetes uses its own
# probes (infra/k8s/20-worker.yaml), this is for docker-compose/local runs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/health || exit 1

# tini as PID 1 (see the apt-get comment above for why), then node.
ENTRYPOINT ["tini", "--"]
CMD ["node", "packages/worker/src/index.js"]
