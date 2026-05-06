# ADR 0001 — Eliminate SystemParamResolver via per-context Auto-Schedule handlers

- **Status:** Proposed — supersedes the mechanical fix shipped in PRs #53 and #55.
- **Date:** 2026-05-06
- **Resolves:** issue #56. Closes the bug-50 family at the source.
- **Bounded contexts touched:** `provider-connectivity`, `search-console-insights`, `traffic-analytics`, `web-performance`, `entity-awareness`, `bing-webmaster-insights`, `experience-analytics`, `macro-context`.

## Context

`ProviderJobDefinition.params` is a single JSONB column that mixes two semantically distinct concepts:

- **userParams** — what the user controls and the provider HTTP needs (`siteUrl`, `propertyId`, `dimensions`, `rowLimit`, dates…). Validated by the descriptor's Zod `paramsSchema`.
- **systemParams** — what the worker needs to attribute results to internal entities (`organizationId`, `projectId`, `gscPropertyId`, `ga4PropertyId`, `trackedPageId`, `wikipediaArticleId`, `bingPropertyId`, `clarityProjectId`, `monitoredDomainId`). Read by the worker's processor for ingest scoping; never sent to the provider.

The bug-50 family arises because the only paths that reliably set systemParams are ad hoc:

- `POST /providers/:p/endpoints/:e/schedule` — controller injects `organizationId` from the project, but other systemParams come from the request body. Easy to forget at integration time.
- `AutoScheduleOnGscPropertyLinkedHandler` — only GSC has one. The other contexts publish their `XLinked` events into the void.
- `ScheduleEndpointFetchUseCase` + `SystemParamResolver` (PRs #53/#55, the mechanical fix) — runs at schedule-creation time, looks up the internal entity from a user-facing identifier.

When any path misses a key, the worker's `provider-fetch.processor.ts` logs a warning and silently discards the payload, marking the run as **succeeded**. Operators see "fetch OK" in the API while the hypertable stays empty.

As of 2026-05-06, **7 endpoints** require an entity-bound systemParam:

| Endpoint | systemParam |
|---|---|
| `gsc-search-analytics` | `gscPropertyId` |
| `ga4-run-report` | `ga4PropertyId` |
| `psi-runpagespeed` | `trackedPageId` |
| `wikipedia-pageviews-per-article` | `wikipediaArticleId` |
| `bing-rank-and-traffic-stats` | `bingPropertyId` |
| `clarity-data-export` | `clarityProjectId` |
| `radar-domain-rank` | `monitoredDomainId` |

Two of these — Clarity and Cloudflare Radar — joined the trap **after** issue #56 was written, confirming the issue's "scales linearly with providers" critique empirically.

A second symptom: the PATCH whitelist in `manage-job-definition.use-cases.ts:64` only covers 4 of the ~10 systemParam keys actually used (`organizationId`, `projectId`, `gscPropertyId`, `trackedKeywordId`). PATCHing a JobDefinition for `ga4PropertyId`, `trackedPageId`, `wikipediaArticleId`, `bingPropertyId`, `clarityProjectId`, or `monitoredDomainId` silently drops the key — a live bug today, not a hypothetical risk.

## Decision

Adopt a structural fix combining three pieces:

### 1. Option A — per-context Auto-Schedule handlers replace the resolver pattern

Every bounded context with an entity-bound endpoint subscribes its own handler to the `XLinked` (or equivalent) domain event. The handler invokes `ScheduleEndpointFetchUseCase` with both `params` and `systemParams` already correct. **The handler becomes the single entry point** for entity-bound JobDefinition creation.

### 2. Option D (reframed) — processor guards become assertions

Under #1 the systemParam is always present at execute time. The 7 `if (!params.<x>Id) { warn; skip }` branches in `provider-fetch.processor.ts` are unreachable in production. They become `throw NotFoundError` (programmer error if reached) and the run is marked **failed** with a clear error. No silent ingest drop remains.

### 3. Operational migration

A one-shot script reconciles existing prod JobDefinitions with missing or stale systemParams.

### Deferred

- **Option B** (descriptor-driven resolvers): rejected. Pollutes the pure descriptor with orchestration concerns and requires a service-locator pattern alien to the codebase.
- **Option C** (split `system_params` column in DB): deferred. Solves a real schema-level concern but is orthogonal to the creation-path bug. Should ship as a follow-up cleanup once #1 stabilises and observability needs justify the migration cost.

## Consequences

### Bounded-context inventory

| Context | Endpoint | Linked event | Handler |
|---|---|---|---|
| `search-console-insights` | `gsc-search-analytics` | `GscPropertyLinked` ✓ | exists, **needs idempotency** |
| `traffic-analytics` | `ga4-run-report` | `Ga4PropertyLinked` ✓ | **missing** |
| `web-performance` | `psi-runpagespeed` | (verify name during phase 1) | **missing** |
| `entity-awareness` | `wikipedia-pageviews-per-article` | `WikipediaArticleLinked` ✓ | **missing** |
| `bing-webmaster-insights` | `bing-rank-and-traffic-stats` | `BingPropertyLinked` ✓ | **missing** |
| `experience-analytics` | `clarity-data-export` | `ClarityProjectLinked` ✓ | **missing** |
| `macro-context` | `radar-domain-rank` | (verify name during phase 1) | **missing** |
| `provider-connectivity` | — | — | hosts `ScheduleEndpointFetchUseCase`; tightens the gate |

`web-performance` and `macro-context` event names are unverified in this ADR; the implementation plan opens with an audit phase that may surface "no event yet" → publish one before subscribing.

### What stays / what goes / what changes

- **Stays:** `ScheduleEndpointFetchUseCase` — now invoked from auto-schedule handlers and from non-entity-bound flows only. Its `systemParams` parameter remains for orchestration.
- **Goes:**
  - The 5 `SystemParamResolver` implementations under `<context>/system-param-resolvers/`.
  - The `systemParamResolvers` parameter on `ScheduleEndpointFetchUseCase`.
  - The resolver-wiring block + BACKLOG #50 comment in `composition-root.ts`.
- **Changes:**
  - The 7 processor guards in `provider-fetch.processor.ts` change from `warn + skip` to `throw NotFoundError` → run `failed`.
  - `POST /providers/:p/endpoints/:e/schedule` returns **400** for the 7 entity-bound endpoints with a redirect message naming the correct entity-link route.
  - `SYSTEM_PARAM_KEYS` in `manage-job-definition.use-cases.ts` is extended to cover all systemParam keys actually used today (~10: `organizationId`, `projectId`, `trackedKeywordId`, plus the 7 entity ids) as defence in depth (a future rogue PATCH path is one mistake away).

The route itself is **kept** for non-entity-bound endpoints (SERP fan-out, public-crawler-ip-ranges, etc.). Implementation plan enumerates them.

### Idempotency

Every auto-schedule handler MUST be idempotent on `(projectId, endpointId, <entityId>)`. If `XLinked` fires twice (replay, dual delivery, re-link), the handler does NOT create a duplicate JobDefinition; it returns the existing one or no-ops.

Requires a new repository method:

```ts
JobDefinitionRepository.findByProjectEndpointAndSystemParam(
  projectId: ProjectId,
  endpointId: EndpointId,
  systemParamKey: string,
  systemParamValue: string,
): Promise<ProviderJobDefinition | null>;
```

The existing `AutoScheduleOnGscPropertyLinkedHandler` is **not** idempotent today (verified in `auto-schedule-on-link.handler.ts:80–94`); it gets updated as part of this work.

### Multi-entity per project

A project may link multiple entities of the same kind (e.g. 3 GSC properties). Each link creates one JobDefinition per `(projectId, endpointId, <entityId>)` tuple. The idempotency check uses the systemParam value, not the project alone, so this is correct by construction.

### Failure mode of auto-schedule

If `ScheduleEndpointFetchUseCase` throws inside the handler, the link is already persisted; failing the API call would leave a half-state. Current GSC handler swallows + logs; this ADR keeps that behaviour but tightens the contract:

- Logger MUST be the production pino logger (composition-root wires it; tests use the noop), not silent.
- The error log MUST include `{ projectId, endpointId, entityId, err.message }` so the dashboard query for "links without schedule" is straightforward.
- Operators recover via the entity link UI's "retry auto-schedule" action (out of scope here, tracked separately).

### Backwards-compat with existing prod data

Existing prod JobDefinitions for the 6 currently-broken contexts may have:

- Missing systemParams (created via `POST .../schedule` before the resolver shipped).
- Wrong systemParams (mock UUIDs from early dev runs).
- Or simply not exist (the bounded context never had auto-schedule).

A one-shot ops script `apps/api/scripts/repair-job-definitions.ts` iterates all entity-bound definitions, resolves the entity from the user-facing params (`siteUrl`, `propertyId`, `url`, article slug…), and either patches the systemParams or deletes the definition for re-creation via the link flow. Runnable as `pnpm --filter @rankpulse/api repair:job-definitions [--dry-run]`. PR #53's manual ops note is pre-figured for GSC; this generalises it.

### Schema change

None in this ADR. `provider_job_definitions.params` stays as a single JSONB. Splitting into `params` + `system_params` is Option C — out of scope, follow-up cleanup.

## Acceptance criteria

(Detailed task breakdown lives in the implementation plan; these are the merge-gate boxes.)

- [ ] Each of the 6 missing bounded contexts has its `AutoScheduleOn<X>LinkedHandler` parallel to GSC's, with idempotency on `(projectId, endpointId, <entityId>)`.
- [ ] `AutoScheduleOnGscPropertyLinkedHandler` is updated for idempotency; spec covers the dedupe path.
- [ ] `JobDefinitionRepository` exposes `findByProjectEndpointAndSystemParam` with Drizzle + in-memory implementations.
- [ ] `POST /providers/:p/endpoints/:e/schedule` returns 400 for the 7 entity-bound endpoints with a clear redirect message.
- [ ] The 7 processor guards in `provider-fetch.processor.ts` `throw` instead of `warn + skip`. Runs are marked `failed`.
- [ ] All 5 `SystemParamResolver` files deleted. `ScheduleEndpointFetchUseCase` no longer accepts a resolver list. composition-root no longer wires resolvers. BACKLOG #50 comment removed.
- [ ] `SYSTEM_PARAM_KEYS` in `manage-job-definition.use-cases.ts` covers every systemParam key any processor reads today.
- [ ] `apps/web/src/pages/schedules.page.tsx` and `schedule-fetch-drawer.tsx` either hide entity-bound endpoints OR redirect to the entity link page.
- [ ] `apps/api/scripts/repair-job-definitions.ts` reconciles existing prod definitions; supports `--dry-run` and emits a fixed/unfixable report.
- [ ] One integration test per context: link entity → JobDefinition created with correct systemParams → run-now → row in hypertable. (Vitest + Testcontainers Postgres.)
- [ ] This ADR committed under `docs/adr/`.

## Alternatives considered

- **Option B — descriptor metadata declaring systemParams + repo lookup:** rejected. Pushes orchestration concerns into the pure `EndpointDescriptor` and requires a service-locator (lookup repos by string token) that exists nowhere else in the codebase. Adds a new mental model to absorb every integration cycle.
- **Option C — split `system_params` column in DB:** deferred. Real schema-level concern (the JSONB lump prevents `WHERE system_params->>'gscPropertyId' = …` queries, observability, indexing) but orthogonal to the creation-path bug this ADR fixes. Should be a separate ADR once Option A stabilises.
- **Status quo (resolver pattern only):** rejected. Empirically reproduces — Clarity + Radar both fell into the trap between PR #55 shipping and this ADR being drafted. Each new entity-bound endpoint costs 4 touch points (resolver, whitelist, composition-root wiring, processor guard); a single missed touch point reproduces bug #50.

## References

- Issue [#56](https://github.com/vgpastor/RankPulse/issues/56)
- Bug [#50](https://github.com/vgpastor/RankPulse/issues/50) — root symptom (GSC ingest discarded silently)
- Bug [#51](https://github.com/vgpastor/RankPulse/issues/51) — PATCH dropping systemParams
- PR [#53](https://github.com/vgpastor/RankPulse/pull/53) — mechanical fix for GSC
- PR [#55](https://github.com/vgpastor/RankPulse/pull/55) — mechanical fix extended to Ga4/Bing/PSI/Wikipedia
- BACKLOG comment in `apps/api/src/composition/composition-root.ts:225–231`
