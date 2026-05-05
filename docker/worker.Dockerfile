# BACKLOG #16 — multi-stage Docker image for the BullMQ worker.
# Same pattern as api.Dockerfile; only the workspace filter and the
# entrypoint differ.

FROM node:24.10.0-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.33.2

# ---------- builder ----------
FROM base AS builder

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rankpulse/worker... build

ENV CI=true
RUN pnpm prune --prod

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
USER node

WORKDIR /app
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/worker ./apps/worker

WORKDIR /app/apps/worker
# Worker exposes a small health server on HEALTH_PORT (default 3300).
# `/readyz` checks Postgres + Redis + every BullMQ worker is running;
# `/healthz` just confirms the process is alive (used here so a slow
# Postgres doesn't take the container down).
EXPOSE 3300
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3300/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
