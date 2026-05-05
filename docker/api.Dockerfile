# BACKLOG #16 — multi-stage Docker image for the NestJS API.
#
# Stage 1 (builder): pnpm install (default isolated linker — pnpm
# materialises per-package node_modules with bin shims that the workspace
# build scripts rely on), then `pnpm --filter @rankpulse/api... build`
# walks the dep graph in topological order producing `dist/` everywhere.
#
# Stage 2 (runtime): copies the built workspace + a pruned (prod-only)
# node_modules tree. The api's package.json `main: ./dist/main.js` and
# every workspace package's `exports` map (default → dist) make
# `node dist/main.js` resolve cross-package imports without
# @swc-node/register on the hot path.
#
# Image is built from the repo root — `context: .` in ci.yml.

FROM node:24.10.0-alpine AS base
WORKDIR /app
# pnpm via direct npm install matches the CI workflow exactly (corepack
# bridge has hit edge cases on alpine where the shim isn't materialised
# by the time the next step runs).
RUN npm install -g pnpm@10.33.2

# ---------- builder ----------
FROM base AS builder

# Bring in everything in one shot. Layer-cache splitting (manifests
# first, then sources) was tempting but the alpine pnpm install needs
# to see workspace packages on disk to resolve `workspace:*` correctly.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Build api + every workspace package it transitively depends on.
RUN pnpm --filter @rankpulse/api... build

# Strip dev deps so the runtime stage is slimmer. CI=true tells pnpm
# we're non-interactive — without it, `prune` aborts asking for TTY
# confirmation before deleting node_modules.
ENV CI=true
RUN pnpm prune --prod

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production

# Non-root by default. node:alpine ships uid 1000 already.
USER node

WORKDIR /app
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
