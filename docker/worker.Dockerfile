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
EXPOSE 3001
CMD ["node", "dist/main.js"]
