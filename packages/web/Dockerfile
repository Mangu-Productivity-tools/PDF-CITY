# Multi-stage Dockerfile for @epub2pdf/web (Next.js App Router, JS, standalone
# output). This is an npm-workspaces monorepo, so build from the REPO ROOT:
#
#   docker build -f packages/web/Dockerfile -t epub2pdf-web \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com .
#
#   docker run -p 3000:3000 epub2pdf-web
#
# NEXT_PUBLIC_API_BASE_URL is a browser-visible var: Next.js inlines it into
# the client bundle at `next build` time, so it MUST be supplied as a build
# ARG (above) — setting it with `docker run -e` alone has no effect on an
# already-built image.

# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /repo

# ---- deps: install only what @epub2pdf/web needs, using the shared lockfile
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/worker/package.json packages/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace packages/web --include-workspace-root

# ---- builder: compile the Next.js app
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/web/node_modules ./packages/web/node_modules
COPY package.json package-lock.json ./
COPY packages/web packages/web

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build --workspace packages/web

# ---- runner: slim runtime image, only the traced standalone output
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `next build` with output:'standalone' (next.config.js) traces the minimal
# node_modules + server needed to run, mirroring the monorepo path.
COPY --from=builder --chown=nextjs:nodejs /repo/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/packages/web/public ./packages/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "packages/web/server.js"]
