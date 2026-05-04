# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /workspace

# Workspace manifests + lockfile (better cache hits when only sources change).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infrastructure/package.json ./packages/infrastructure/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/providers/core/package.json ./packages/providers/core/package.json
COPY packages/providers/dataforseo/package.json ./packages/providers/dataforseo/package.json
COPY packages/providers/google-search-console/package.json ./packages/providers/google-search-console/package.json
COPY packages/config-typescript/package.json ./packages/config-typescript/package.json
COPY packages/config-biome/package.json ./packages/config-biome/package.json

RUN pnpm install --frozen-lockfile

# Sources. Workspace packages are consumed directly from src/ (their main
# fields point at ./src/index.ts) and Node loads them through swc-node, which
# transpiles TypeScript on the fly and emits decorator metadata properly.
COPY packages ./packages
COPY apps/api ./apps/api

EXPOSE 3000
USER node
CMD ["pnpm", "--filter", "@rankpulse/api", "start"]
