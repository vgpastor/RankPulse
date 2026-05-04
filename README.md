# RankPulse

Open-source self-hosted SEO intelligence platform for **multi-project, multi-domain, multi-country** monitoring.

> Replace Ahrefs/Semrush for multi-project monitoring at a fraction of the cost (~$4-7/month vs $99+/month). Self-hosted, single `docker-compose up`, AGPL-3.0.

## Status

Early development. The architecture and roadmap are defined in `docs/architecture.md`. The first milestone is `v0.1.0` covering Sprint 0 → Sprint 8 of the roadmap.

## Highlights

- **Multi-provider data collection**: DataForSEO, Google Search Console, Google Analytics 4, Ahrefs Free, manual crawlers — pluggable architecture, add new providers in their own package.
- **Proxy / cache by design**: every external request is deduplicated across projects, coalesced in-flight, persisted, and served from cache when fresh. The same SERP query for ten projects = one external API call.
- **Multi-scope credentials**: a credential lives at `org`, `portfolio`, `project`, or `domain` level. The resolver picks the most specific one available at fetch time.
- **DDD by functional SEO domains**: bounded contexts mirror the business language (`rank-tracking`, `backlink-intelligence`, `competitor-intelligence`, `search-console-insights`, `web-analytics`, `keyword-research`, `alerting`, `reporting`). No generic `metrics` blob — each context owns its own typed observations.
- **Time-series first**: TimescaleDB hypertables per functional context, continuous aggregates for fast dashboards, JSONB for raw provider payloads (data lake).
- **OpenAPI 3.1 first-class**: every endpoint is documented with rich descriptions and examples so external LLMs can discover and consume the API directly. Auto-generated TypeScript SDK.
- **Atomic Design frontend**: React + Vite + Tailwind + shadcn/ui + Storybook with reusable atoms / molecules / organisms.

## Tech stack

- Backend: NestJS 10 + TypeScript (strict)
- Persistence: Postgres 16 + TimescaleDB extension via Drizzle ORM
- Queue: BullMQ + Redis
- Frontend: React 18 + Vite 5 + TanStack Router + TanStack Query + Tailwind + shadcn/ui
- Tests: Vitest (unit + integration) + Playwright (e2e) + Testcontainers
- Tooling: pnpm workspaces + Turborepo + Biome
- License: **AGPL-3.0**

## Repository layout

```
apps/
  api/        NestJS HTTP API (REST + OpenAPI)
  worker/     BullMQ workers (provider fetch, normalize, alerts, reports)
  web/        React SPA
  docs/       Astro Starlight documentation site
packages/
  shared/                     Result, Either, ids, Clock, errors
  domain/                     Pure DDD core (one folder per bounded context)
  application/                Use cases per context
  infrastructure/             Adapters: persistence, queue, crypto, oauth, observability
  contracts/                  DTOs and integration events shared api <-> web
  sdk/                        Auto-generated TS client from OpenAPI
  ui/                         Atomic Design library (Storybook)
  providers/                  One package per external provider
  testing/                    In-memory adapters and aggregate factories
```

See `docs/architecture.md` for the full bounded-context map, data model, and roadmap.

## Quick start (development)

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d postgres redis
cp .env.example .env
# apply migrations
pnpm --filter @rankpulse/infrastructure db:migrate
# in three terminals:
pnpm --filter @rankpulse/api dev
pnpm --filter @rankpulse/worker dev
pnpm --filter @rankpulse/web dev
```

API on `http://localhost:3000`, OpenAPI JSON on `/openapi.json`, Swagger UI on `/docs`.

The api/worker scripts use `node --import @swc-node/register/esm-register` so
TypeScript is transpiled on the fly with full decorator-metadata support
(needed by Nest's DI). `swc-node` reads `apps/api/.swcrc` and `apps/worker/.swcrc`.

### Production

`docker compose -f docker-compose.dev.yml --profile full up -d` builds the
api, worker and web images and brings the whole stack online. The api/worker
images run the same `pnpm start` (swc-node) used in dev.

## Contributing

See `CONTRIBUTING.md`. Security disclosures: `SECURITY.md`.

## License

[AGPL-3.0-or-later](./LICENSE). The AGPL preserves the project as a community-owned tool: anyone running RankPulse as a service must share their modifications.
