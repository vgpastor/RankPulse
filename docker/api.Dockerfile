# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /workspace

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infrastructure/package.json ./packages/infrastructure/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/config-typescript/package.json ./packages/config-typescript/package.json
COPY packages/config-biome/package.json ./packages/config-biome/package.json
RUN pnpm fetch
RUN pnpm install --frozen-lockfile --offline

FROM deps AS build
COPY tsconfig.base.json biome.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @rankpulse/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/packages ./packages
EXPOSE 3000
USER node
CMD ["node", "--enable-source-maps", "apps/api/dist/main.js"]
