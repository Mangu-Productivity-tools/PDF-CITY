# syntax=docker/dockerfile:1
#
# packages/api/Dockerfile
#
# NOTE - UNTESTED IN THIS SANDBOX: the Docker CLI is present here but the
# daemon cannot start (sandbox restriction - `service docker start` fails on
# a ulimit permission error), so this file has never actually been through
# `docker build`. It was authored carefully against the real
# packages/api/package.json + packages/api/src, but please build and
# smoke-test it (`docker build -t epub2pdf-api . && docker run --rm -p
# 3000:3000 epub2pdf-api`, then hit GET /health) in CI or on a real Docker
# host before deploying.
#
# NOTE - NODE 20 IS EOL: this uses node:20-alpine per this task's explicit
# instruction, but per nodejs.org/en/about/previous-releases, Node 20
# ("Iron")'s end-of-life date was 2026-04-30 - already past as of this
# writing, meaning no further upstream security patches. Node 22 ("Jod") is
# in Maintenance LTS until 2027-04-30 and Node 24 ("Krypton") is the current
# Active LTS until 2028-04-30 - either would be a one-line base-image tag
# swap (here and in packages/worker/Dockerfile) if the team wants to move
# off an EOL runtime; confirm with whoever owns the Node version policy
# before changing it unilaterally, since the root package.json's `engines`
# field (currently `>=18`, so it wouldn't block a bump) and CI
# (.github/workflows/ci.yml's NODE_VERSION) would ideally move together
# with it for consistency, even though neither strictly forces Node 20.
#
# Multi-stage Node 20 image for @epub2pdf/api. Pure JS, no native
# dependencies that need glibc, so Alpine's smaller footprint is safe here
# (contrast with packages/worker/Dockerfile, which needs a real Chromium
# binary + Calibre and is Debian-based for that reason).
#
# This is an npm-workspaces monorepo with a single root package-lock.json.
# Build context for this image is expected to be the REPO ROOT, e.g.:
#   docker build -f packages/api/Dockerfile .
# (not `packages/api/` - it needs to reach ../shared and the root lockfile).

# ---------------------------------------------------------------------------
# Stage 1: install only this service's + packages/shared's dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Root manifest + lockfile first, for layer caching.
COPY package.json package-lock.json ./

# `npm ci` in a workspaces repo validates the lockfile against EVERY
# workspace's package.json it can find via the root `workspaces: ["packages/*"]`
# glob. If a workspace directory has no package.json on disk at all, npm
# just won't treat it as a workspace for this install - but if the lockfile
# already contains resolved entries for other workspaces (@epub2pdf/worker,
# @epub2pdf/web) and npm's glob only turns up a partial set, npm ci can
# fail the lockfile-sync check ("Missing: @epub2pdf/x from lock file").
# Copying all four (tiny, no node_modules/source) package.json files sidesteps
# that entirely, while --workspace below still scopes the ACTUAL dependency
# install to just api + shared - worker's puppeteer-core/Calibre deps and
# web's future Next.js deps never get pulled into this image.
COPY packages/api/package.json packages/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/worker/package.json packages/worker/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci \
      --workspace packages/api \
      --workspace packages/shared \
      --omit=dev \
      --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: bring in the actual source (kept separate from `deps` so source
# edits don't invalidate the npm ci layer above)
# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages/api/src packages/api/src
COPY packages/shared/src packages/shared/src

# ---------------------------------------------------------------------------
# Stage 3: slim runtime image, non-root
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Official node:*-alpine images ship a pre-created, unprivileged `node`
# user/group (uid/gid 1000) specifically for this purpose - no need to
# create one by hand. multer is configured with memoryStorage() (see
# packages/api/src/routes/convert.js), so this service does not write
# uploaded files to disk; /tmp is chown'd anyway as cheap insurance for any
# incidental scratch use (e.g. by a transitive dependency), and to support
# infra/k8s's readOnlyRootFilesystem: true SecurityContext.
RUN mkdir -p /tmp && chown -R node:node /app /tmp

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/api ./packages/api
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared

USER node

EXPOSE 3000

# alpine's busybox includes `wget` by default - no extra package needed for
# this. Note Kubernetes does NOT use this HEALTHCHECK; the Deployment in
# infra/k8s/10-api.yaml defines its own livenessProbe/readinessProbe against
# the same /health endpoint. This is mainly useful for `docker run` /
# docker-compose usage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "packages/api/src/index.js"]
