# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /workspace

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infrastructure/package.json ./packages/infrastructure/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/providers/core/package.json ./packages/providers/core/package.json
COPY packages/providers/dataforseo/package.json ./packages/providers/dataforseo/package.json
COPY packages/providers/google-search-console/package.json ./packages/providers/google-search-console/package.json

RUN pnpm install --frozen-lockfile

# Sources consumed directly via swc-node — see api.Dockerfile for rationale.
COPY packages ./packages
COPY apps/worker ./apps/worker

USER node
CMD ["pnpm", "--filter", "@rankpulse/worker", "start"]
