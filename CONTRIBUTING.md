# Contributing to RankPulse

Thanks for your interest. RankPulse is built around clear architectural rules. Following them keeps the codebase healthy as it grows.

## Architectural rules

1. **DDD by functional SEO domain.** Bounded contexts are named after business concepts (`rank-tracking`, `backlink-intelligence`, ...), not technical concerns. Don't introduce a generic `metrics` or `data` context.
2. **Dependency direction is one-way:**
   - `domain` depends on nothing (no NestJS, no I/O libraries, no ORM).
   - `application` depends only on `domain`.
   - `infrastructure` depends on `domain` and `application`.
   - `providers/*` depend on `domain`, `application`, `infrastructure`.
   - `apps/*` wire everything together.
3. **NestJS lives only in `apps/api` and `apps/worker`.** Domain and application packages must remain framework-agnostic.
4. **Mock only at port boundaries.** Unit tests target use cases. They use real entities, value objects, and aggregates. They mock only the ports defined in `domain/<context>/ports` (repositories, clocks, event publishers, etc.). If you find yourself mocking something internal to the use case, extract a port instead.
5. **Tests assert observable behavior**, not internal calls. Prefer in-memory adapters from `packages/testing` over `vi.fn()` whenever possible.
6. **Add a provider in its own package** under `packages/providers/<name>`. Providers implement the `Provider` contract and declare their endpoints, schedules, cache TTLs, and idempotency windows. The core never knows about a specific provider.
7. **Cache and deduplicate by default.** Every new endpoint must declare `cacheTtl` and `idempotencyWindow` in its descriptor. Cross-project deduplication and in-flight coalescing are non-negotiable.
8. **OpenAPI documentation is part of the API change.** Each new endpoint must include `summary`, `description`, request/response examples, and tags. CI lints the OpenAPI spec with Spectral.

## Local setup

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d
cp .env.example .env
pnpm typecheck
pnpm test:unit
```

## Commit style

Conventional Commits. Examples:

```
feat(rank-tracking): publish KeywordPositionChanged event on observation ingest
fix(provider-connectivity): resolve credential cascade when domain scope is empty
test(project-management): cover invalid-domain rejection in CreateProjectUseCase
```

## Pull requests

- Keep PRs focused (one bounded context or one cross-cutting concern).
- Include unit tests for new use cases.
- Update `docs/architecture.md` if you add a context or a provider.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` before pushing.
