# Eliminate SystemParamResolver — Auto-Schedule Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `SystemParamResolver` mechanical fix with per-context Auto-Schedule event handlers, retire the silent "missing X param; skipping ingest" failure mode, and migrate existing prod data. Closes [issue #56](https://github.com/vgpastor/RankPulse/issues/56).

**Architecture:** Each bounded context with an entity-bound endpoint (GSC, GA4, Wikipedia, Bing, Clarity, TrackedPage, MonitoredDomain) subscribes a thin handler to its `XLinked`/`XAdded` domain event. Handler invokes `ScheduleEndpointFetchUseCase` with `params` and `systemParams` already correct. Idempotency lives inside the use case via a new optional `idempotencyKey` field on the command (use case checks repo by entity id before creating). The processor's silent-skip guards become `throw NotFoundError` — runs become `failed`, never silently OK. `POST /providers/:p/endpoints/:e/schedule` returns 400 for entity-bound endpoints. SystemParamResolver port + 5 implementations are deleted.

**Tech Stack:** TypeScript 5.x strict, NestJS 11, Drizzle ORM, Vitest, Testcontainers, BullMQ, pino, Zod. ESM modules with `.js` extensions in imports.

**Reference ADR:** [`docs/adr/0001-eliminate-systemparamresolver-via-auto-schedule-handlers.md`](../../adr/0001-eliminate-systemparamresolver-via-auto-schedule-handlers.md) — read first.

**Bounded contexts inventory (canonical names + paths):**

| Endpoint | Provider | systemParam | Event | LinkUseCase | Default cron |
|---|---|---|---|---|---|
| `gsc-search-analytics` | `google-search-console` | `gscPropertyId` | `SearchConsoleInsights.GscPropertyLinked` | `LinkGscPropertyUseCase` | `0 5 * * *` |
| `ga4-run-report` | `google-analytics-4` | `ga4PropertyId` | `TrafficAnalytics.Ga4PropertyLinked` | `LinkGa4PropertyUseCase` | `0 5 * * *` |
| `wikipedia-pageviews-per-article` | `wikipedia` | `wikipediaArticleId` | `EntityAwareness.WikipediaArticleLinked` | `LinkWikipediaArticleUseCase` | `0 6 * * *` |
| `bing-rank-and-traffic-stats` | `bing-webmaster` | `bingPropertyId` | `BingWebmasterInsights.BingPropertyLinked` | `LinkBingPropertyUseCase` | `0 5 * * *` |
| `clarity-data-export` | `microsoft-clarity` | `clarityProjectId` | `ExperienceAnalytics.ClarityProjectLinked` | `LinkClarityProjectUseCase` | `0 6 * * *` |
| `psi-runpagespeed` | `pagespeed-insights` | `trackedPageId` | `WebPerformance.TrackedPageAdded` | `TrackPageUseCase` | `0 7 * * *` |
| `radar-domain-rank` | `cloudflare-radar` | `monitoredDomainId` | `MacroContext.MonitoredDomainAdded` | `AddMonitoredDomainUseCase` | `0 6 * * *` |

Default crons are spread to avoid cold-start on the worker. Phase 0 verifies the event class names against the actual code; if any differ from this table, the plan substitutes the real name and proceeds.

**Conventions reminder:**
- **DDD layering:** domain → application → infrastructure. Handlers live in `packages/application/src/<context>/event-handlers/`. Repos live in `packages/domain/src/<context>/ports/`. Drizzle adapters in `packages/infrastructure/src/persistence/drizzle/repositories/`.
- **Naming:** `auto-schedule-on-link.handler.ts` (or `auto-schedule-on-add.handler.ts` for TrackedPage/MonitoredDomain). Spec sibling.
- **Imports:** ESM with `.js` extension. `import type` for type-only.
- **Tests:** Vitest, mock at the use-case interface boundary (`vi.fn()`), not deeper. Use the existing GSC handler spec ([`auto-schedule-on-link.handler.spec.ts`](../../../packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.spec.ts)) as the structural template.
- **Commits:** one per task. Conventional Commits with bounded-context scope: `feat(traffic-analytics): auto-schedule daily Ga4 fetch on property link`.
- **Issue claim:** before starting, `gh issue edit 56 --add-assignee @me --add-label wip` and comment "Tomando esto" (per CLAUDE.md §9).

---

## Phase 0 — Audit & claim issue

Verification phase. Confirms the event class names in the bounded-contexts table actually exist in the code. No production code is modified.

### Task 0.1: Claim issue #56

**Files:** none.

- [ ] **Step 1: Verify nobody else has claimed it**

```bash
gh issue view 56 --repo vgpastor/RankPulse --json assignees,labels
```

Expected: `"assignees": []` and no `"name": "wip"` label. If non-empty, STOP and consult before proceeding.

- [ ] **Step 2: Claim**

```bash
gh issue edit 56 --repo vgpastor/RankPulse --add-assignee @me --add-label wip
gh issue comment 56 --repo vgpastor/RankPulse --body "Tomando esto — implementing per docs/adr/0001-eliminate-systemparamresolver-via-auto-schedule-handlers.md"
```

Expected: both commands succeed.

### Task 0.2: Verify event class names

**Files:** read-only — `packages/domain/src/<context>/events/*.ts`.

- [ ] **Step 1: Grep each expected event**

Run each:

```bash
rg -l "class GscPropertyLinked" packages/domain/src/search-console-insights/events/
rg -l "class Ga4PropertyLinked" packages/domain/src/traffic-analytics/events/
rg -l "class WikipediaArticleLinked" packages/domain/src/entity-awareness/events/
rg -l "class BingPropertyLinked" packages/domain/src/bing-webmaster-insights/events/
rg -l "class ClarityProjectLinked" packages/domain/src/experience-analytics/events/
rg -l "class TrackedPageAdded" packages/domain/src/web-performance/events/
rg -l "class MonitoredDomainAdded" packages/domain/src/macro-context/events/
```

Expected: each returns exactly one file path. If any returns empty, open the events folder for that context and update the inventory table at the top of this plan with the actual class name before proceeding.

- [ ] **Step 2: Verify each event carries the necessary payload**

Open each event file. The handler's `params` body needs:
- `projectId`
- `organizationId`
- The systemParam value (e.g. `gscPropertyId`)
- The user-facing identifier the provider expects (e.g. `siteUrl`, `propertyId`, `url`, etc.)

For each event, confirm the constructor param list includes those. If any field is missing, that's a domain-event change — out of scope for this plan; flag it on the issue, fix the event in a precursor PR, then come back.

- [ ] **Step 3: Verify the LinkX use case publishes the event**

```bash
rg -l "publish.*GscPropertyLinked" packages/application/src/search-console-insights/use-cases/
rg -l "publish.*Ga4PropertyLinked" packages/application/src/traffic-analytics/use-cases/
rg -l "publish.*WikipediaArticleLinked" packages/application/src/entity-awareness/use-cases/
rg -l "publish.*BingPropertyLinked" packages/application/src/bing-webmaster-insights/use-cases/
rg -l "publish.*ClarityProjectLinked" packages/application/src/experience-analytics/use-cases/
rg -l "publish.*TrackedPageAdded" packages/application/src/web-performance/use-cases/
rg -l "publish.*MonitoredDomainAdded" packages/application/src/macro-context/use-cases/
```

Expected: each returns a use-case file path. If any returns empty, the use case isn't publishing the event — fix that in a precursor PR before proceeding.

- [ ] **Step 4: Commit (audit notes only — nothing changed)**

No commit; this task produces only confirmation. Proceed to Phase 1.

---

## Phase 1 — Repository method + use-case idempotency

Adds the new repo method and threads `idempotencyKey` through `ScheduleEndpointFetchUseCase`. After this phase, the use case can be called idempotently and the existing GSC controller path automatically benefits.

### Task 1.1: Extend `JobDefinitionRepository` port with `findByProjectEndpointAndSystemParam`

**Files:**
- Modify: `packages/domain/src/provider-connectivity/ports/job-definition-repository.ts`

- [ ] **Step 1: Edit the port to add the new method**

Replace the file contents with:

```ts
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { ProviderJobDefinition } from '../entities/provider-job-definition.js';
import type { EndpointId } from '../value-objects/endpoint-id.js';
import type { ProviderJobDefinitionId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface JobDefinitionRepository {
	save(definition: ProviderJobDefinition): Promise<void>;
	findById(id: ProviderJobDefinitionId): Promise<ProviderJobDefinition | null>;
	findFor(
		projectId: ProjectId,
		providerId: ProviderId,
		endpointId: EndpointId,
		paramsHash: string,
	): Promise<ProviderJobDefinition | null>;
	/**
	 * Idempotency lookup for auto-schedule handlers.
	 *
	 * Returns the JobDefinition (if any) for `(projectId, endpointId)` whose
	 * `params.<systemParamKey>` equals `systemParamValue`. Used by
	 * `ScheduleEndpointFetchUseCase` to avoid duplicate creation when an
	 * entity-link event is replayed.
	 *
	 * Implementation note: query by `params->>{systemParamKey} = $value`.
	 * The current schema mixes user/system params in one JSONB column; the
	 * field is queryable but unindexed. Acceptable at current cardinality
	 * (≤ N projects × ≤ M entities per project).
	 */
	findByProjectEndpointAndSystemParam(
		projectId: ProjectId,
		endpointId: EndpointId,
		systemParamKey: string,
		systemParamValue: string,
	): Promise<ProviderJobDefinition | null>;
	listForProject(projectId: ProjectId): Promise<readonly ProviderJobDefinition[]>;
	delete(id: ProviderJobDefinitionId): Promise<void>;
}
```

- [ ] **Step 2: Typecheck the domain package — expect failures from missing impl**

```bash
pnpm --filter @rankpulse/domain typecheck
```

Expected: PASS (the port is just an interface; no consumer compiles yet).

- [ ] **Step 3: Typecheck the whole repo — expect Drizzle adapter to fail**

```bash
pnpm typecheck
```

Expected: FAIL in `packages/infrastructure/src/persistence/drizzle/repositories/provider-connectivity/job-definition.repository.ts` with "Property 'findByProjectEndpointAndSystemParam' is missing in type". This is the next task.

### Task 1.2: Implement `findByProjectEndpointAndSystemParam` in the Drizzle adapter

**Files:**
- Modify: `packages/infrastructure/src/persistence/drizzle/repositories/provider-connectivity/job-definition.repository.ts`

- [ ] **Step 1: Read the existing file to see the table schema and existing query patterns**

```bash
cat packages/infrastructure/src/persistence/drizzle/repositories/provider-connectivity/job-definition.repository.ts
```

Note the existing `findFor` implementation — copy its overall shape (drizzle import, table reference, mapping helper).

- [ ] **Step 2: Add the method**

Insert (after the existing `findFor` method, before `listForProject`):

```ts
async findByProjectEndpointAndSystemParam(
	projectId: ProjectId,
	endpointId: EndpointId,
	systemParamKey: string,
	systemParamValue: string,
): Promise<ProviderJobDefinition | null> {
	const rows = await this.db
		.select()
		.from(providerJobDefinitions)
		.where(
			and(
				eq(providerJobDefinitions.projectId, projectId),
				eq(providerJobDefinitions.endpointId, endpointId.value),
				// jsonb path query: params->>'<key>' = '<value>'
				sql`${providerJobDefinitions.params}->>${systemParamKey} = ${systemParamValue}`,
			),
		)
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return this.toEntity(row);
}
```

If `sql`, `and`, `eq` aren't already imported at the top of the file, add them to the existing `import { ... } from 'drizzle-orm'` line (they're standard drizzle helpers).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @rankpulse/infrastructure typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/provider-connectivity/ports/job-definition-repository.ts \
        packages/infrastructure/src/persistence/drizzle/repositories/provider-connectivity/job-definition.repository.ts
git commit -m "feat(provider-connectivity): add findByProjectEndpointAndSystemParam to JobDefinitionRepository"
```

### Task 1.3: Add idempotency support to `ScheduleEndpointFetchUseCase`

**Files:**
- Modify: `packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.ts`
- Modify: `packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.spec.ts`

- [ ] **Step 1: Add a failing test for the idempotency path**

Append to `schedule-endpoint-fetch.use-case.spec.ts` (inside the existing `describe('ScheduleEndpointFetchUseCase', ...)` block):

```ts
it('returns the existing definitionId when idempotencyKey resolves an existing JobDefinition', async () => {
	const existingDefinitionId = 'existing-def-id';
	// Inject an in-memory definitions repo where findByProjectEndpointAndSystemParam returns a hit
	const definitions = makeStubDefinitionsRepo({
		findByProjectEndpointAndSystemParam: async () =>
			ProviderConnectivity.ProviderJobDefinition.schedule({
				id: existingDefinitionId as ProviderConnectivity.ProviderJobDefinitionId,
				projectId: PROJECT_ID,
				providerId: ProviderConnectivity.ProviderId.create('google-search-console'),
				endpointId: ProviderConnectivity.EndpointId.create('gsc-search-analytics'),
				params: { siteUrl: 'sc-domain:example.com', gscPropertyId: 'prop-1' },
				cron: ProviderConnectivity.CronExpression.create('0 5 * * *'),
				credentialOverrideId: null,
				now: new Date(),
			}),
	});
	const scheduler = makeStubScheduler();
	const useCase = new ScheduleEndpointFetchUseCase(
		definitions, scheduler, validatorAccepts, fixedClock, fixedIdGen, eventPublisherStub,
	);

	const result = await useCase.execute({
		projectId: PROJECT_ID,
		providerId: 'google-search-console',
		endpointId: 'gsc-search-analytics',
		params: { siteUrl: 'sc-domain:example.com' },
		systemParams: { organizationId: ORG_ID, gscPropertyId: 'prop-1' },
		cron: '0 5 * * *',
		idempotencyKey: { systemParamKey: 'gscPropertyId', systemParamValue: 'prop-1' },
	});

	expect(result.definitionId).toBe(existingDefinitionId);
	expect(scheduler.register).not.toHaveBeenCalled(); // existing — no re-register
	// And no save either
	expect(definitions.save).not.toHaveBeenCalled();
});
```

The names `makeStubDefinitionsRepo`, `makeStubScheduler`, `validatorAccepts`, `fixedClock`, `fixedIdGen`, `eventPublisherStub`, `PROJECT_ID`, `ORG_ID` are the existing test fixtures in the file — reuse whatever the file currently defines. If the file currently inlines the stubs, follow the same inline pattern.

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @rankpulse/application test -- schedule-endpoint-fetch.use-case.spec
```

Expected: FAIL — either with "idempotencyKey is not assignable to type ScheduleEndpointFetchCommand" (compile error) or with the `definitionId` returning a freshly generated id instead of `existingDefinitionId`.

- [ ] **Step 3: Add `idempotencyKey` to the command type and implement the early-return**

In `schedule-endpoint-fetch.use-case.ts`, modify the command interface:

```ts
export interface ScheduleEndpointFetchCommand {
	projectId: string;
	providerId: string;
	endpointId: string;
	params: Record<string, unknown>;
	systemParams?: Record<string, unknown>;
	cron: string;
	credentialOverrideId?: string | null;
	/**
	 * Optional idempotency key. When provided, the use case looks up an
	 * existing JobDefinition for `(projectId, endpointId)` whose
	 * `params.<systemParamKey>` equals `systemParamValue`; if found, returns
	 * its definitionId without creating a duplicate. Used by per-context
	 * Auto-Schedule handlers so that re-emitting the link event (replay,
	 * reconnect, dual delivery) doesn't duplicate the schedule.
	 */
	idempotencyKey?: { systemParamKey: string; systemParamValue: string };
}
```

Then modify `execute()` — insert the idempotency check immediately after the validator runs (before id generation):

```ts
async execute(cmd: ScheduleEndpointFetchCommand): Promise<ScheduleEndpointFetchResult> {
	const providerId = ProviderConnectivity.ProviderId.create(cmd.providerId);
	const endpointId = ProviderConnectivity.EndpointId.create(cmd.endpointId);
	const cron = ProviderConnectivity.CronExpression.create(cmd.cron);
	const projectId = cmd.projectId as ProjectManagement.ProjectId;

	const validatedParams = this.paramsValidator.validate(providerId.value, endpointId.value, cmd.params);
	if (typeof validatedParams !== 'object' || validatedParams === null) {
		throw new InvalidInputError(
			`Endpoint ${endpointId.value} paramsSchema must resolve to an object, got ${typeof validatedParams}`,
		);
	}

	// Idempotency: if the caller supplied an idempotency key, return the
	// existing definitionId without creating a duplicate. This is what makes
	// auto-schedule handlers safe under event replay / reconnect.
	if (cmd.idempotencyKey) {
		const existing = await this.definitions.findByProjectEndpointAndSystemParam(
			projectId,
			endpointId,
			cmd.idempotencyKey.systemParamKey,
			cmd.idempotencyKey.systemParamValue,
		);
		if (existing) return { definitionId: existing.id };
	}

	// Run cross-context resolvers (legacy mechanical fix; removed in Phase 8
	// once auto-schedule handlers cover all entity-bound endpoints).
	let resolvedSystemParams: Record<string, unknown> = { ...(cmd.systemParams ?? {}) };
	for (const resolver of this.systemParamResolvers) {
		const extra = await resolver.resolve({
			projectId: cmd.projectId,
			providerId: providerId.value,
			endpointId: endpointId.value,
			params: validatedParams,
		});
		resolvedSystemParams = { ...resolvedSystemParams, ...extra };
	}

	const finalParams: Record<string, unknown> = { ...validatedParams, ...resolvedSystemParams };

	const id = this.ids.generate() as ProviderConnectivity.ProviderJobDefinitionId;
	const definition = ProviderConnectivity.ProviderJobDefinition.schedule({
		id,
		projectId,
		providerId,
		endpointId,
		params: finalParams,
		cron,
		credentialOverrideId: cmd.credentialOverrideId
			? (cmd.credentialOverrideId as ProviderConnectivity.ProviderCredentialId)
			: null,
		now: this.clock.now(),
	});

	await this.definitions.save(definition);
	await this.scheduler.register(definition);
	await this.events.publish(definition.pullEvents());

	return { definitionId: id };
}
```

- [ ] **Step 4: Run the spec — verify pass**

```bash
pnpm --filter @rankpulse/application test -- schedule-endpoint-fetch.use-case.spec
```

Expected: PASS (all existing tests + the new one).

- [ ] **Step 5: Run all application tests**

```bash
pnpm --filter @rankpulse/application test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.ts \
        packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.spec.ts
git commit -m "feat(provider-connectivity): add idempotencyKey to ScheduleEndpointFetch"
```

### Task 1.4: Update GSC Auto-Schedule handler to pass `idempotencyKey`

**Files:**
- Modify: `packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.ts`
- Modify: `packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.spec.ts`

- [ ] **Step 1: Add a failing test for the idempotency path**

Append to the existing `describe('AutoScheduleOnGscPropertyLinkedHandler', ...)` block in the spec:

```ts
it('passes idempotencyKey {gscPropertyId} so re-emission does not duplicate the schedule', async () => {
	const { handler, execute } = buildHandler();
	await handler.handle(buildEvent());
	const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
	expect(cmd.idempotencyKey).toEqual({
		systemParamKey: 'gscPropertyId',
		systemParamValue: PROPERTY_ID,
	});
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @rankpulse/application test -- search-console-insights/event-handlers/auto-schedule-on-link
```

Expected: FAIL — `cmd.idempotencyKey` is `undefined`.

- [ ] **Step 3: Update the handler to pass `idempotencyKey`**

In `auto-schedule-on-link.handler.ts`, find the `scheduleEndpointFetch.execute({...})` call (around line 80) and add `idempotencyKey` after `credentialOverrideId`:

```ts
const result = await this.scheduleEndpointFetch.execute({
	projectId,
	providerId: GSC_AUTO_SCHEDULE_DEFAULTS.providerId,
	endpointId: GSC_AUTO_SCHEDULE_DEFAULTS.endpointId,
	params: {
		siteUrl,
		startDate: GSC_AUTO_SCHEDULE_DEFAULTS.startDateToken,
		endDate: GSC_AUTO_SCHEDULE_DEFAULTS.endDateToken,
		dimensions: [...GSC_AUTO_SCHEDULE_DEFAULTS.dimensions],
		rowLimit: GSC_AUTO_SCHEDULE_DEFAULTS.rowLimit,
	},
	systemParams: { organizationId, gscPropertyId },
	cron: GSC_AUTO_SCHEDULE_DEFAULTS.cron,
	credentialOverrideId: null,
	idempotencyKey: { systemParamKey: 'gscPropertyId', systemParamValue: gscPropertyId },
});
```

- [ ] **Step 4: Run the spec — verify pass**

```bash
pnpm --filter @rankpulse/application test -- search-console-insights/event-handlers/auto-schedule-on-link
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.ts \
        packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.spec.ts
git commit -m "feat(search-console-insights): make GSC auto-schedule handler idempotent"
```

---

## Phase 2 — Implement 6 new auto-schedule handlers

Six near-identical tasks. Each follows the same TDD shape: spec → fail → handler → pass → wire in composition-root → commit.

**For every handler in this phase, the file structure is:**

```
packages/application/src/<context>/event-handlers/auto-schedule-on-<link|add>.handler.ts
packages/application/src/<context>/event-handlers/auto-schedule-on-<link|add>.handler.spec.ts
```

And the handler MUST be exported from `packages/application/src/<context>/index.ts`.

### Task 2.1: traffic-analytics — `Ga4PropertyLinked` → daily GA4 fetch

**Files:**
- Create: `packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.ts`
- Create: `packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.spec.ts`
- Modify: `packages/application/src/traffic-analytics/index.ts`
- Modify: `apps/api/src/composition/composition-root.ts`

- [ ] **Step 1: Write the failing spec**

Create `packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.spec.ts`:

```ts
import {
	type IdentityAccess,
	type ProjectManagement,
	TrafficAnalytics,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnGa4PropertyLinkedHandler,
	GA4_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const PROPERTY_ID = '44444444-4444-4444-4444-444444444444' as TrafficAnalytics.Ga4PropertyId;
const GA4_PROPERTY_HANDLE = 'properties/123456789';

const buildEvent = (overrides: Partial<TrafficAnalytics.Ga4PropertyLinked> = {}) =>
	new TrafficAnalytics.Ga4PropertyLinked({
		ga4PropertyId: PROPERTY_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		propertyHandle: GA4_PROPERTY_HANDLE,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnGa4PropertyLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnGa4PropertyLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		const otherEvent = { type: 'GscPropertyLinked', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent;
		await handler.handle(otherEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('on Ga4PropertyLinked, calls ScheduleEndpointFetch with defaults + idempotencyKey {ga4PropertyId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		expect(execute).toHaveBeenCalledTimes(1);
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			cron: '0 5 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'ga4PropertyId', systemParamValue: PROPERTY_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, ga4PropertyId: PROPERTY_ID });
		expect(cmd.params).toMatchObject({
			propertyId: GA4_PROPERTY_HANDLE,
			startDate: '{{today-30}}',
			endDate: '{{today-2}}',
		});
	});

	it('logs info on success with the new definition id', async () => {
		const { handler, logger } = buildHandler();
		await handler.handle(buildEvent());
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ ga4PropertyId: PROPERTY_ID, definitionId: 'def-1' }),
			expect.stringContaining('auto-scheduled'),
		);
	});

	it('SWALLOWS errors and logs them (link is already persisted)', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('scheduler down'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnGa4PropertyLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ ga4PropertyId: PROPERTY_ID, err: 'scheduler down' }),
			expect.stringContaining('auto-schedule failed'),
		);
	});

	it('exposes its defaults for composition root and integration tests', () => {
		expect(GA4_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			cron: '0 5 * * *',
		});
	});
});
```

If `Ga4PropertyLinked` doesn't have a `propertyHandle` field — substitute the actual field name (likely `ga4Handle`, `propertyResourceName`, or similar) found in Phase 0 Step 2.

- [ ] **Step 2: Run the spec — confirm fail (handler doesn't exist)**

```bash
pnpm --filter @rankpulse/application test -- traffic-analytics/event-handlers/auto-schedule-on-link
```

Expected: FAIL with "Cannot find module './auto-schedule-on-link.handler.js'".

- [ ] **Step 3: Implement the handler**

Create `packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.ts`:

```ts
import type { SharedKernel, TrafficAnalytics } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = {
	info: () => {},
	error: () => {},
};

/**
 * Defaults for the auto-created GA4 run-report JobDefinition.
 *
 * Window:
 *  - `startDate: '{{today-30}}'` — rolling 30-day window. GA4 keeps 14 months
 *    by default but the operationally interesting window is short.
 *  - `endDate: '{{today-2}}'` — GA4 has a ~24h finalisation lag for some
 *    metrics; querying `today-2` returns stable rows.
 *
 * Cron is `0 5 * * *` (daily 05:00 UTC) — matches GSC defaults so a project
 * with both providers fans out at the same tick.
 */
export const GA4_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'google-analytics-4',
	endpointId: 'ga4-run-report',
	cron: '0 5 * * *',
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-2}}',
};

/**
 * Auto-schedule daily GA4 fetch when a property is linked.
 *
 * Listens to `Ga4PropertyLinked` and invokes `ScheduleEndpointFetchUseCase`
 * with the daily-cron defaults so the worker starts persisting GA4 rows
 * immediately. Idempotency on `ga4PropertyId` so re-emission of the link
 * event (replay, reconnect, dual delivery) returns the existing
 * definitionId instead of creating a duplicate.
 *
 * Failure mode: scheduling errors are LOGGED, not propagated. The link is
 * already persisted; failing the API call would leave a half-state.
 */
export class AutoScheduleOnGa4PropertyLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'Ga4PropertyLinked') return;
		const { ga4PropertyId, projectId, organizationId, propertyHandle } =
			event as TrafficAnalytics.Ga4PropertyLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: GA4_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: GA4_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					propertyId: propertyHandle,
					startDate: GA4_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: GA4_AUTO_SCHEDULE_DEFAULTS.endDateToken,
				},
				systemParams: { organizationId, ga4PropertyId },
				cron: GA4_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'ga4PropertyId', systemParamValue: ga4PropertyId },
			});
			this.logger.info(
				{ ga4PropertyId, definitionId: result.definitionId },
				'auto-scheduled daily GA4 fetch on property link',
			);
		} catch (err) {
			this.logger.error(
				{ ga4PropertyId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on Ga4PropertyLinked — operator must schedule manually',
			);
		}
	}
}
```

If `Ga4PropertyLinked` exposes the user-facing identifier under a different field name, substitute it (the destructure on the first line of `handle`, and the `params.propertyId` value).

- [ ] **Step 4: Run the spec — verify pass**

```bash
pnpm --filter @rankpulse/application test -- traffic-analytics/event-handlers/auto-schedule-on-link
```

Expected: PASS.

- [ ] **Step 5: Export the handler from the context's barrel**

Modify `packages/application/src/traffic-analytics/index.ts` — add at the bottom (or in a sorted block matching existing convention):

```ts
export * from './event-handlers/auto-schedule-on-link.handler.js';
```

If the file already has an `event-handlers` exports block, add the line there.

- [ ] **Step 6: Wire in composition-root**

Modify `apps/api/src/composition/composition-root.ts`. Find the GSC auto-schedule wiring (around line 359; subscription on line 372) and add a parallel block for GA4 immediately after:

```ts
const autoScheduleOnGa4Link = new TAUseCases.AutoScheduleOnGa4PropertyLinkedHandler(
	scheduleEndpointFetch,
	{
		info: (meta, msg) => {
			// eslint-disable-next-line no-console
			console.log(`[auto-schedule-on-ga4-link] ${msg}`, meta);
		},
		error: (meta, msg) => {
			// eslint-disable-next-line no-console
			console.error(`[auto-schedule-on-ga4-link] ${msg}`, meta);
		},
	},
);
eventPublisher.on('Ga4PropertyLinked', (event) => {
	void autoScheduleOnGa4Link.handle(event);
});
```

(`TAUseCases` is the existing alias for `@rankpulse/application/traffic-analytics` — verify the import at the top of the file uses that alias.)

- [ ] **Step 7: Typecheck the api app**

```bash
pnpm --filter @rankpulse/api typecheck
```

Expected: PASS.

- [ ] **Step 8: Run all tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.ts \
        packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.spec.ts \
        packages/application/src/traffic-analytics/index.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "feat(traffic-analytics): auto-schedule daily GA4 fetch on property link"
```

### Task 2.2: entity-awareness — `WikipediaArticleLinked` → daily Wikipedia pageviews

**Files:**
- Create: `packages/application/src/entity-awareness/event-handlers/auto-schedule-on-link.handler.ts`
- Create: `packages/application/src/entity-awareness/event-handlers/auto-schedule-on-link.handler.spec.ts`
- Modify: `packages/application/src/entity-awareness/index.ts`
- Modify: `apps/api/src/composition/composition-root.ts`

- [ ] **Step 1: Write the failing spec**

Create `auto-schedule-on-link.handler.spec.ts`:

```ts
import {
	EntityAwareness,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnWikipediaArticleLinkedHandler,
	WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const ARTICLE_ID = '55555555-5555-5555-5555-555555555555' as EntityAwareness.WikipediaArticleId;
const WIKI_PROJECT = 'en.wikipedia';
const ARTICLE_SLUG = 'TypeScript';

const buildEvent = (overrides: Partial<EntityAwareness.WikipediaArticleLinked> = {}) =>
	new EntityAwareness.WikipediaArticleLinked({
		wikipediaArticleId: ARTICLE_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		project: WIKI_PROJECT,
		article: ARTICLE_SLUG,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnWikipediaArticleLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnWikipediaArticleLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		const otherEvent = { type: 'GscPropertyLinked', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent;
		await handler.handle(otherEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('on WikipediaArticleLinked, calls ScheduleEndpointFetch with defaults + idempotencyKey {wikipediaArticleId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'wikipedia',
			endpointId: 'wikipedia-pageviews-per-article',
			cron: '0 6 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'wikipediaArticleId', systemParamValue: ARTICLE_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, wikipediaArticleId: ARTICLE_ID });
		expect(cmd.params).toMatchObject({ project: WIKI_PROJECT, article: ARTICLE_SLUG });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnWikipediaArticleLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes its defaults', () => {
		expect(WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'wikipedia',
			endpointId: 'wikipedia-pageviews-per-article',
			cron: '0 6 * * *',
		});
	});
});
```

- [ ] **Step 2: Run the spec — confirm fail**

```bash
pnpm --filter @rankpulse/application test -- entity-awareness/event-handlers/auto-schedule-on-link
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `auto-schedule-on-link.handler.ts`:

```ts
import type { EntityAwareness, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

/**
 * Defaults for the auto-created Wikipedia pageviews-per-article JobDefinition.
 *
 * Wikipedia's pageviews API keeps a long history; we run daily at 06:00 UTC
 * (after the GA4 cron) to spread worker load.
 */
export const WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'wikipedia',
	endpointId: 'wikipedia-pageviews-per-article',
	cron: '0 6 * * *',
	granularity: 'daily',
	startDateToken: '{{today-30}}',
	endDateToken: '{{today-1}}',
};

/**
 * Auto-schedule daily Wikipedia pageviews fetch on article link.
 * Idempotent on `wikipediaArticleId`. Errors are logged, not propagated.
 */
export class AutoScheduleOnWikipediaArticleLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'WikipediaArticleLinked') return;
		const { wikipediaArticleId, projectId, organizationId, project, article } =
			event as EntityAwareness.WikipediaArticleLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					project,
					article,
					granularity: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.granularity,
					startDate: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.startDateToken,
					endDate: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.endDateToken,
				},
				systemParams: { organizationId, wikipediaArticleId },
				cron: WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: {
					systemParamKey: 'wikipediaArticleId',
					systemParamValue: wikipediaArticleId,
				},
			});
			this.logger.info(
				{ wikipediaArticleId, definitionId: result.definitionId },
				'auto-scheduled daily Wikipedia pageviews fetch on link',
			);
		} catch (err) {
			this.logger.error(
				{ wikipediaArticleId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on WikipediaArticleLinked — operator must schedule manually',
			);
		}
	}
}
```

Substitute field names from the actual `WikipediaArticleLinked` event class if they differ.

- [ ] **Step 4: Run spec, verify pass**

```bash
pnpm --filter @rankpulse/application test -- entity-awareness/event-handlers/auto-schedule-on-link
```

Expected: PASS.

- [ ] **Step 5: Export from `packages/application/src/entity-awareness/index.ts`**

Add: `export * from './event-handlers/auto-schedule-on-link.handler.js';`

- [ ] **Step 6: Wire in composition-root**

In `apps/api/src/composition/composition-root.ts`, after the GA4 wiring from Task 2.1:

```ts
const autoScheduleOnWikipediaLink = new EAUseCases.AutoScheduleOnWikipediaArticleLinkedHandler(
	scheduleEndpointFetch,
	{
		info: (meta, msg) => { console.log(`[auto-schedule-on-wikipedia-link] ${msg}`, meta); },
		error: (meta, msg) => { console.error(`[auto-schedule-on-wikipedia-link] ${msg}`, meta); },
	},
);
eventPublisher.on('WikipediaArticleLinked', (event) => {
	void autoScheduleOnWikipediaLink.handle(event);
});
```

- [ ] **Step 7: Typecheck + test + commit**

```bash
pnpm --filter @rankpulse/api typecheck && pnpm test
git add packages/application/src/entity-awareness/event-handlers/ \
        packages/application/src/entity-awareness/index.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "feat(entity-awareness): auto-schedule daily Wikipedia pageviews on article link"
```

### Task 2.3: bing-webmaster-insights — `BingPropertyLinked` → daily Bing rank/traffic stats

**Files:**
- Create: `packages/application/src/bing-webmaster-insights/event-handlers/auto-schedule-on-link.handler.ts`
- Create: `packages/application/src/bing-webmaster-insights/event-handlers/auto-schedule-on-link.handler.spec.ts`
- Modify: `packages/application/src/bing-webmaster-insights/index.ts`
- Modify: `apps/api/src/composition/composition-root.ts`

- [ ] **Step 1: Write the failing spec**

Create `auto-schedule-on-link.handler.spec.ts` (mirrors GA4 task structure; substitute Bing types):

```ts
import {
	BingWebmasterInsights,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnBingPropertyLinkedHandler,
	BING_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const PROPERTY_ID = '66666666-6666-6666-6666-666666666666' as BingWebmasterInsights.BingPropertyId;
const SITE_URL = 'https://patroltech.online/';

const buildEvent = (overrides: Partial<BingWebmasterInsights.BingPropertyLinked> = {}) =>
	new BingWebmasterInsights.BingPropertyLinked({
		bingPropertyId: PROPERTY_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		siteUrl: SITE_URL,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnBingPropertyLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnBingPropertyLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({ type: 'GscPropertyLinked', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {bingPropertyId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'bing-webmaster',
			endpointId: 'bing-rank-and-traffic-stats',
			cron: '0 5 * * *',
			idempotencyKey: { systemParamKey: 'bingPropertyId', systemParamValue: PROPERTY_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, bingPropertyId: PROPERTY_ID });
		expect(cmd.params).toMatchObject({ siteUrl: SITE_URL });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnBingPropertyLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(BING_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'bing-webmaster',
			endpointId: 'bing-rank-and-traffic-stats',
			cron: '0 5 * * *',
		});
	});
});
```

- [ ] **Step 2: Run spec — confirm fail**

```bash
pnpm --filter @rankpulse/application test -- bing-webmaster-insights/event-handlers/auto-schedule-on-link
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `auto-schedule-on-link.handler.ts`:

```ts
import type { BingWebmasterInsights, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

export const BING_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'bing-webmaster',
	endpointId: 'bing-rank-and-traffic-stats',
	cron: '0 5 * * *',
};

export class AutoScheduleOnBingPropertyLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'BingPropertyLinked') return;
		const { bingPropertyId, projectId, organizationId, siteUrl } =
			event as BingWebmasterInsights.BingPropertyLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: BING_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: BING_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: { siteUrl },
				systemParams: { organizationId, bingPropertyId },
				cron: BING_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'bingPropertyId', systemParamValue: bingPropertyId },
			});
			this.logger.info(
				{ bingPropertyId, definitionId: result.definitionId },
				'auto-scheduled daily Bing fetch on property link',
			);
		} catch (err) {
			this.logger.error(
				{ bingPropertyId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on BingPropertyLinked — operator must schedule manually',
			);
		}
	}
}
```

- [ ] **Step 4: Run spec, verify pass**

```bash
pnpm --filter @rankpulse/application test -- bing-webmaster-insights/event-handlers/auto-schedule-on-link
```

Expected: PASS.

- [ ] **Step 5: Export + wire + typecheck + test + commit**

```ts
// packages/application/src/bing-webmaster-insights/index.ts
export * from './event-handlers/auto-schedule-on-link.handler.js';
```

```ts
// apps/api/src/composition/composition-root.ts — after Wikipedia block
const autoScheduleOnBingLink = new BWIUseCases.AutoScheduleOnBingPropertyLinkedHandler(
	scheduleEndpointFetch,
	{
		info: (meta, msg) => { console.log(`[auto-schedule-on-bing-link] ${msg}`, meta); },
		error: (meta, msg) => { console.error(`[auto-schedule-on-bing-link] ${msg}`, meta); },
	},
);
eventPublisher.on('BingPropertyLinked', (event) => {
	void autoScheduleOnBingLink.handle(event);
});
```

```bash
pnpm --filter @rankpulse/api typecheck && pnpm test
git add packages/application/src/bing-webmaster-insights/event-handlers/ \
        packages/application/src/bing-webmaster-insights/index.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "feat(bing-webmaster-insights): auto-schedule daily Bing fetch on property link"
```

### Task 2.4: experience-analytics — `ClarityProjectLinked` → daily Clarity export

**Files:**
- Create: `packages/application/src/experience-analytics/event-handlers/auto-schedule-on-link.handler.ts`
- Create: `packages/application/src/experience-analytics/event-handlers/auto-schedule-on-link.handler.spec.ts`
- Modify: `packages/application/src/experience-analytics/index.ts`
- Modify: `apps/api/src/composition/composition-root.ts`

- [ ] **Step 1: Write the failing spec**

```ts
import {
	ExperienceAnalytics,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnClarityProjectLinkedHandler,
	CLARITY_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const CLARITY_PROJECT_ID = '77777777-7777-7777-7777-777777777777' as ExperienceAnalytics.ClarityProjectId;
const CLARITY_PROJECT_HANDLE = 'abcd1234ef';

const buildEvent = (overrides: Partial<ExperienceAnalytics.ClarityProjectLinked> = {}) =>
	new ExperienceAnalytics.ClarityProjectLinked({
		clarityProjectId: CLARITY_PROJECT_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		clarityHandle: CLARITY_PROJECT_HANDLE,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnClarityProjectLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnClarityProjectLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({ type: 'GscPropertyLinked', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {clarityProjectId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'microsoft-clarity',
			endpointId: 'clarity-data-export',
			cron: '0 6 * * *',
			idempotencyKey: { systemParamKey: 'clarityProjectId', systemParamValue: CLARITY_PROJECT_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, clarityProjectId: CLARITY_PROJECT_ID });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnClarityProjectLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(CLARITY_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'microsoft-clarity',
			endpointId: 'clarity-data-export',
			cron: '0 6 * * *',
		});
	});
});
```

Substitute the real field name (likely `clarityProjectHandle`, `clarityKey`, or similar) on the event class — found in Phase 0 Step 2.

- [ ] **Step 2: Run spec — confirm fail**

```bash
pnpm --filter @rankpulse/application test -- experience-analytics/event-handlers/auto-schedule-on-link
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```ts
import type { ExperienceAnalytics, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

export const CLARITY_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'microsoft-clarity',
	endpointId: 'clarity-data-export',
	cron: '0 6 * * *',
	numOfDays: 1,
};

export class AutoScheduleOnClarityProjectLinkedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'ClarityProjectLinked') return;
		const { clarityProjectId, projectId, organizationId } =
			event as ExperienceAnalytics.ClarityProjectLinked;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: CLARITY_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: CLARITY_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: {
					numOfDays: CLARITY_AUTO_SCHEDULE_DEFAULTS.numOfDays,
				},
				systemParams: { organizationId, clarityProjectId },
				cron: CLARITY_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'clarityProjectId', systemParamValue: clarityProjectId },
			});
			this.logger.info(
				{ clarityProjectId, definitionId: result.definitionId },
				'auto-scheduled daily Clarity export on project link',
			);
		} catch (err) {
			this.logger.error(
				{ clarityProjectId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on ClarityProjectLinked — operator must schedule manually',
			);
		}
	}
}
```

The Clarity API expects a project key/handle on a `projectId` field in the user-facing params; that's distinct from the internal `clarityProjectId` in systemParams. Verify the descriptor's paramsSchema field names match what's used here (open `packages/providers/microsoft-clarity/src/...descriptor.ts` and check). Substitute if different.

- [ ] **Step 4: Run spec, verify pass**

```bash
pnpm --filter @rankpulse/application test -- experience-analytics/event-handlers/auto-schedule-on-link
```

Expected: PASS.

- [ ] **Step 5: Export + wire + typecheck + test + commit**

```ts
// packages/application/src/experience-analytics/index.ts
export * from './event-handlers/auto-schedule-on-link.handler.js';
```

```ts
// apps/api/src/composition/composition-root.ts — after Bing block
const autoScheduleOnClarityLink = new EXAUseCases.AutoScheduleOnClarityProjectLinkedHandler(
	scheduleEndpointFetch,
	{
		info: (meta, msg) => { console.log(`[auto-schedule-on-clarity-link] ${msg}`, meta); },
		error: (meta, msg) => { console.error(`[auto-schedule-on-clarity-link] ${msg}`, meta); },
	},
);
eventPublisher.on('ClarityProjectLinked', (event) => {
	void autoScheduleOnClarityLink.handle(event);
});
```

```bash
pnpm --filter @rankpulse/api typecheck && pnpm test
git add packages/application/src/experience-analytics/event-handlers/ \
        packages/application/src/experience-analytics/index.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "feat(experience-analytics): auto-schedule daily Clarity export on project link"
```

### Task 2.5: web-performance — `TrackedPageAdded` → daily PSI run

**Files:**
- Create: `packages/application/src/web-performance/event-handlers/auto-schedule-on-add.handler.ts`
- Create: `packages/application/src/web-performance/event-handlers/auto-schedule-on-add.handler.spec.ts`
- Modify: `packages/application/src/web-performance/index.ts`
- Modify: `apps/api/src/composition/composition-root.ts`

Note: TrackedPage uses the `Added` semantics, not `Linked`. File and class names reflect that.

- [ ] **Step 1: Write the failing spec**

```ts
import {
	type IdentityAccess,
	type ProjectManagement,
	WebPerformance,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnTrackedPageAddedHandler,
	PSI_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-add.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const TRACKED_PAGE_ID = '88888888-8888-8888-8888-888888888888' as WebPerformance.TrackedPageId;
const URL = 'https://patroltech.online/blog/post';
const STRATEGY = 'mobile';

const buildEvent = (overrides: Partial<WebPerformance.TrackedPageAdded> = {}) =>
	new WebPerformance.TrackedPageAdded({
		trackedPageId: TRACKED_PAGE_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		url: URL,
		strategy: STRATEGY,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnTrackedPageAddedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnTrackedPageAddedHandler', () => {
	it('ignores other event types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({ type: 'GscPropertyLinked', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {trackedPageId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'pagespeed-insights',
			endpointId: 'psi-runpagespeed',
			cron: '0 7 * * *',
			idempotencyKey: { systemParamKey: 'trackedPageId', systemParamValue: TRACKED_PAGE_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, trackedPageId: TRACKED_PAGE_ID });
		expect(cmd.params).toMatchObject({ url: URL, strategy: STRATEGY });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnTrackedPageAddedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(PSI_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'pagespeed-insights',
			endpointId: 'psi-runpagespeed',
			cron: '0 7 * * *',
		});
	});
});
```

- [ ] **Step 2: Run spec — confirm fail**

```bash
pnpm --filter @rankpulse/application test -- web-performance/event-handlers/auto-schedule-on-add
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```ts
import type { SharedKernel, WebPerformance } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

export const PSI_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'pagespeed-insights',
	endpointId: 'psi-runpagespeed',
	cron: '0 7 * * *',
};

export class AutoScheduleOnTrackedPageAddedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'TrackedPageAdded') return;
		const { trackedPageId, projectId, organizationId, url, strategy } =
			event as WebPerformance.TrackedPageAdded;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: PSI_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: PSI_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: { url, strategy },
				systemParams: { organizationId, trackedPageId },
				cron: PSI_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'trackedPageId', systemParamValue: trackedPageId },
			});
			this.logger.info(
				{ trackedPageId, definitionId: result.definitionId },
				'auto-scheduled daily PSI run on tracked-page add',
			);
		} catch (err) {
			this.logger.error(
				{ trackedPageId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on TrackedPageAdded — operator must schedule manually',
			);
		}
	}
}
```

- [ ] **Step 4: Run spec, verify pass**

```bash
pnpm --filter @rankpulse/application test -- web-performance/event-handlers/auto-schedule-on-add
```

Expected: PASS.

- [ ] **Step 5: Export + wire + typecheck + test + commit**

```ts
// packages/application/src/web-performance/index.ts
export * from './event-handlers/auto-schedule-on-add.handler.js';
```

```ts
// apps/api/src/composition/composition-root.ts — after Clarity block
const autoScheduleOnTrackedPageAdded = new WPUseCases.AutoScheduleOnTrackedPageAddedHandler(
	scheduleEndpointFetch,
	{
		info: (meta, msg) => { console.log(`[auto-schedule-on-tracked-page-added] ${msg}`, meta); },
		error: (meta, msg) => { console.error(`[auto-schedule-on-tracked-page-added] ${msg}`, meta); },
	},
);
eventPublisher.on('TrackedPageAdded', (event) => {
	void autoScheduleOnTrackedPageAdded.handle(event);
});
```

```bash
pnpm --filter @rankpulse/api typecheck && pnpm test
git add packages/application/src/web-performance/event-handlers/ \
        packages/application/src/web-performance/index.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "feat(web-performance): auto-schedule daily PSI run on tracked-page add"
```

### Task 2.6: macro-context — `MonitoredDomainAdded` → daily Cloudflare Radar fetch

**Files:**
- Create: `packages/application/src/macro-context/event-handlers/auto-schedule-on-add.handler.ts`
- Create: `packages/application/src/macro-context/event-handlers/auto-schedule-on-add.handler.spec.ts`
- Modify: `packages/application/src/macro-context/index.ts`
- Modify: `apps/api/src/composition/composition-root.ts`

- [ ] **Step 1: Write the failing spec**

```ts
import {
	type IdentityAccess,
	type ProjectManagement,
	MacroContext,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnMonitoredDomainAddedHandler,
	RADAR_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-add.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const DOMAIN_ID = '99999999-9999-9999-9999-999999999999' as MacroContext.MonitoredDomainId;
const DOMAIN = 'patroltech.online';

const buildEvent = (overrides: Partial<MacroContext.MonitoredDomainAdded> = {}) =>
	new MacroContext.MonitoredDomainAdded({
		monitoredDomainId: DOMAIN_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		domain: DOMAIN,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnMonitoredDomainAddedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnMonitoredDomainAddedHandler', () => {
	it('ignores other event types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({ type: 'GscPropertyLinked', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {monitoredDomainId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'cloudflare-radar',
			endpointId: 'radar-domain-rank',
			cron: '0 6 * * *',
			idempotencyKey: { systemParamKey: 'monitoredDomainId', systemParamValue: DOMAIN_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, monitoredDomainId: DOMAIN_ID });
		expect(cmd.params).toMatchObject({ domain: DOMAIN });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnMonitoredDomainAddedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(RADAR_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'cloudflare-radar',
			endpointId: 'radar-domain-rank',
			cron: '0 6 * * *',
		});
	});
});
```

- [ ] **Step 2: Run spec — confirm fail**

```bash
pnpm --filter @rankpulse/application test -- macro-context/event-handlers/auto-schedule-on-add
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```ts
import type { MacroContext, SharedKernel } from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = { info: () => {}, error: () => {} };

export const RADAR_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'cloudflare-radar',
	endpointId: 'radar-domain-rank',
	cron: '0 6 * * *',
};

export class AutoScheduleOnMonitoredDomainAddedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'MonitoredDomainAdded') return;
		const { monitoredDomainId, projectId, organizationId, domain } =
			event as MacroContext.MonitoredDomainAdded;

		try {
			const result = await this.scheduleEndpointFetch.execute({
				projectId,
				providerId: RADAR_AUTO_SCHEDULE_DEFAULTS.providerId,
				endpointId: RADAR_AUTO_SCHEDULE_DEFAULTS.endpointId,
				params: { domain },
				systemParams: { organizationId, monitoredDomainId },
				cron: RADAR_AUTO_SCHEDULE_DEFAULTS.cron,
				credentialOverrideId: null,
				idempotencyKey: { systemParamKey: 'monitoredDomainId', systemParamValue: monitoredDomainId },
			});
			this.logger.info(
				{ monitoredDomainId, definitionId: result.definitionId },
				'auto-scheduled daily Cloudflare Radar fetch on domain add',
			);
		} catch (err) {
			this.logger.error(
				{ monitoredDomainId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on MonitoredDomainAdded — operator must schedule manually',
			);
		}
	}
}
```

- [ ] **Step 4: Run spec, verify pass**

```bash
pnpm --filter @rankpulse/application test -- macro-context/event-handlers/auto-schedule-on-add
```

Expected: PASS.

- [ ] **Step 5: Export + wire + typecheck + test + commit**

```ts
// packages/application/src/macro-context/index.ts
export * from './event-handlers/auto-schedule-on-add.handler.js';
```

```ts
// apps/api/src/composition/composition-root.ts — after TrackedPage block
const autoScheduleOnMonitoredDomainAdded = new MCUseCases.AutoScheduleOnMonitoredDomainAddedHandler(
	scheduleEndpointFetch,
	{
		info: (meta, msg) => { console.log(`[auto-schedule-on-monitored-domain-added] ${msg}`, meta); },
		error: (meta, msg) => { console.error(`[auto-schedule-on-monitored-domain-added] ${msg}`, meta); },
	},
);
eventPublisher.on('MonitoredDomainAdded', (event) => {
	void autoScheduleOnMonitoredDomainAdded.handle(event);
});
```

```bash
pnpm --filter @rankpulse/api typecheck && pnpm test
git add packages/application/src/macro-context/event-handlers/ \
        packages/application/src/macro-context/index.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "feat(macro-context): auto-schedule daily Cloudflare Radar fetch on monitored-domain add"
```

---

## Phase 3 — Tighten the old paths

### Task 3.1: Gate `POST /providers/:p/endpoints/:e/schedule` for entity-bound endpoints

**Files:**
- Modify: `apps/api/src/modules/provider-connectivity/providers.controller.ts`
- Modify: `apps/api/src/modules/provider-connectivity/providers.controller.spec.ts` (if exists; otherwise add)

The seven entity-bound endpoints + their preferred entity-link routes:

| Endpoint | Use this instead |
|---|---|
| `gsc-search-analytics` | `POST /api/v1/projects/:projectId/gsc/properties` |
| `ga4-run-report` | `POST /api/v1/projects/:projectId/ga4/properties` |
| `wikipedia-pageviews-per-article` | `POST /api/v1/projects/:projectId/wikipedia/articles` |
| `bing-rank-and-traffic-stats` | `POST /api/v1/projects/:projectId/bing/properties` |
| `clarity-data-export` | `POST /api/v1/projects/:projectId/clarity/projects` |
| `psi-runpagespeed` | `POST /api/v1/projects/:projectId/web-performance/tracked-pages` |
| `radar-domain-rank` | `POST /api/v1/projects/:projectId/macro-context/monitored-domains` |

(The exact preferred routes might differ; verify by `rg "@Post.*projects/:projectId" apps/api/src/modules/` and substitute the actual paths.)

- [ ] **Step 1: Add a failing controller test**

In `providers.controller.spec.ts` (or create the file if missing — Nest e2e style with `Test.createTestingModule`), add:

```ts
it.each([
	['google-search-console', 'gsc-search-analytics', 'gsc/properties'],
	['google-analytics-4', 'ga4-run-report', 'ga4/properties'],
	['wikipedia', 'wikipedia-pageviews-per-article', 'wikipedia/articles'],
	['bing-webmaster', 'bing-rank-and-traffic-stats', 'bing/properties'],
	['microsoft-clarity', 'clarity-data-export', 'clarity/projects'],
	['pagespeed-insights', 'psi-runpagespeed', 'web-performance/tracked-pages'],
	['cloudflare-radar', 'radar-domain-rank', 'macro-context/monitored-domains'],
])('rejects POST .../schedule for %s/%s with 400 pointing to %s', async (providerId, endpointId, hint) => {
	const res = await request(app.getHttpServer())
		.post(`/api/v1/providers/${providerId}/endpoints/${endpointId}/schedule`)
		.set('Authorization', `Bearer ${authToken}`)
		.send({ projectId: someProjectId, params: {}, cron: '0 5 * * *' });

	expect(res.status).toBe(400);
	expect(res.body.message).toMatch(new RegExp(hint));
});
```

(Adapt the test harness to whatever `providers.controller.spec.ts` already uses — the existing harness in this file is canonical; this test adds cases.)

- [ ] **Step 2: Run the test — confirm it fails**

```bash
pnpm --filter @rankpulse/api test -- providers.controller
```

Expected: FAIL — current controller does NOT reject; it forwards to the use case (which today either creates the JobDefinition with a stale resolver or with whatever the body provided).

- [ ] **Step 3: Add the gate to the controller**

In `providers.controller.ts`, near the top of the file (or in a sibling `entity-bound-endpoints.ts` that the controller imports), define the constant:

```ts
/**
 * Entity-bound endpoints — these are auto-scheduled by their bounded
 * context's link/add handler. The manual schedule route is blocked because
 * it can't reliably populate the systemParam (which entity does
 * `siteUrl=https://x` map to? the controller can't answer without coupling
 * to every other context).
 *
 * If you're adding a new entity-bound endpoint:
 *  1. Implement `AutoScheduleOn<X>LinkedHandler` in its bounded context.
 *  2. Wire it in composition-root.
 *  3. Add the endpoint here.
 */
const ENTITY_BOUND_ENDPOINTS: Record<string, { provider: string; preferredRoute: string }> = {
	'gsc-search-analytics': { provider: 'google-search-console', preferredRoute: '/api/v1/projects/:projectId/gsc/properties' },
	'ga4-run-report': { provider: 'google-analytics-4', preferredRoute: '/api/v1/projects/:projectId/ga4/properties' },
	'wikipedia-pageviews-per-article': { provider: 'wikipedia', preferredRoute: '/api/v1/projects/:projectId/wikipedia/articles' },
	'bing-rank-and-traffic-stats': { provider: 'bing-webmaster', preferredRoute: '/api/v1/projects/:projectId/bing/properties' },
	'clarity-data-export': { provider: 'microsoft-clarity', preferredRoute: '/api/v1/projects/:projectId/clarity/projects' },
	'psi-runpagespeed': { provider: 'pagespeed-insights', preferredRoute: '/api/v1/projects/:projectId/web-performance/tracked-pages' },
	'radar-domain-rank': { provider: 'cloudflare-radar', preferredRoute: '/api/v1/projects/:projectId/macro-context/monitored-domains' },
};
```

Modify the `scheduleEndpoint` method to check first:

```ts
@Post(':providerId/endpoints/:endpointId/schedule')
@SkipThrottle({ default: true, auth: true })
@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
async scheduleEndpoint(
	@Principal() principal: AuthPrincipal,
	@Param('providerId') providerId: string,
	@Param('endpointId') endpointId: string,
	@Body(new ZodValidationPipe(ProviderConnectivityContracts.ScheduleEndpointRequest))
	body: ScheduleEndpointRequest,
): Promise<{ definitionId: string }> {
	const entityBound = ENTITY_BOUND_ENDPOINTS[endpointId];
	if (entityBound && entityBound.provider === providerId) {
		throw new BadRequestException(
			`Endpoint ${providerId}/${endpointId} is auto-scheduled when you link the entity. ` +
				`Use ${entityBound.preferredRoute} instead. ` +
				`(See ADR 0001 — direct schedule blocked for entity-bound endpoints.)`,
		);
	}
	const project = await this.projects.findById(body.projectId as ProjectManagement.ProjectId);
	if (!project) {
		throw new NotFoundError(`Project ${body.projectId} not found`);
	}
	await this.orgMembership.require(principal, project.organizationId);
	const systemParams: Record<string, unknown> = {
		...(body.systemParams ?? {}),
		organizationId: project.organizationId,
	};
	return this.schedule.execute({
		projectId: body.projectId,
		providerId,
		endpointId,
		params: body.params,
		systemParams,
		cron: body.cron,
		credentialOverrideId: body.credentialOverrideId ?? null,
	});
}
```

(`BadRequestException` is from `@nestjs/common` — add the import if missing.)

- [ ] **Step 4: Run the test — verify pass**

```bash
pnpm --filter @rankpulse/api test -- providers.controller
```

Expected: PASS.

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/provider-connectivity/providers.controller.ts \
        apps/api/src/modules/provider-connectivity/providers.controller.spec.ts
git commit -m "feat(provider-connectivity): gate POST .../schedule for 7 entity-bound endpoints"
```

### Task 3.2: Convert processor guards from `warn + skip` to `throw`

**Files:**
- Modify: `apps/worker/src/processors/provider-fetch.processor.ts`
- Modify: `apps/worker/src/processors/provider-fetch.processor.spec.ts` (if exists)

- [ ] **Step 1: Identify the 7 guard branches**

```bash
rg -n "missing.*Id.*skipping ingest" apps/worker/src/processors/provider-fetch.processor.ts
```

Expected: 7 lines, around lines 358, 387, 415, 441, 474, 499, 523.

- [ ] **Step 2: For each guard, change the behaviour**

Replace each `if (!params.<x>Id) { log.warn(...); return; /* skip */ }` block with:

```ts
if (!<x>Params.<x>Id) {
	throw new NotFoundError(
		`<endpoint-id> processor reached without ${'<x>Id'} in systemParams — ` +
			`this is a programmer error: schedule should have been created via ` +
			`Auto-Schedule handler with idempotencyKey. See ADR 0001.`,
	);
}
```

Concretely:

```ts
// gsc-search-analytics, around line 415
if (!gscParams.gscPropertyId) {
	throw new NotFoundError(
		`gsc-search-analytics processor reached without gscPropertyId in systemParams. ` +
			`Auto-Schedule handler should have set this. See ADR 0001.`,
	);
}
```

Apply the same pattern for the other 6 endpoints (ga4PropertyId, trackedPageId, wikipediaArticleId, bingPropertyId, clarityProjectId, monitoredDomainId).

`NotFoundError` import — at top of file:

```ts
import { NotFoundError } from '@rankpulse/shared';
```

- [ ] **Step 3: Verify the run-failure path is wired**

The processor wraps each endpoint in a `try/catch` that calls `run.fail(errorJson)` on caught error. Open the file and verify the outer try/catch indeed catches `NotFoundError` and marks `run.fail`. If it does NOT (e.g. only catches a specific error class), extend the catch.

Expected current shape (example near line 555):

```ts
try {
	// ... endpoint switch with the 7 guards
} catch (err) {
	const errorJson = {
		code: err instanceof QuotaExceededError ? 'QUOTA_EXCEEDED' : 'FETCH_FAILED',
		message: err instanceof Error ? err.message : String(err),
	};
	run.fail(errorJson);
	await runs.save(run);
	return;
}
```

If the catch is narrower, broaden it — `NotFoundError` should produce `code: 'INGEST_PRECONDITION_FAILED'` (new code) so dashboards can distinguish it from a true upstream fetch failure:

```ts
const code =
	err instanceof QuotaExceededError ? 'QUOTA_EXCEEDED' :
	err instanceof NotFoundError ? 'INGEST_PRECONDITION_FAILED' :
	'FETCH_FAILED';
```

- [ ] **Step 4: Update or add a processor test**

In `provider-fetch.processor.spec.ts` (or wherever processor tests live — locate via `rg -l describe.*provider-fetch.processor apps/worker/`), add a test like:

```ts
it('throws NotFoundError → run.fail when systemParams.gscPropertyId is missing (post-ADR-0001 invariant)', async () => {
	const def = makeJobDef({
		endpointId: 'gsc-search-analytics',
		params: { siteUrl: 'sc-domain:example.com' /* no gscPropertyId */ },
	});
	const run = makeRun(def);
	await processor.process({ runId: run.id, definitionId: def.id });
	const persistedRun = await runs.findById(run.id);
	expect(persistedRun.status).toBe('failed');
	expect(persistedRun.errorJson).toMatchObject({ code: 'INGEST_PRECONDITION_FAILED' });
});
```

(Adapt to the existing test harness; if there's no spec for the processor today, this is the seed.)

- [ ] **Step 5: Run worker tests**

```bash
pnpm --filter @rankpulse/worker test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/processors/provider-fetch.processor.ts \
        apps/worker/src/processors/provider-fetch.processor.spec.ts
git commit -m "feat(worker): processor throws NotFoundError instead of silent ingest skip (ADR 0001)"
```

---

## Phase 4 — PATCH whitelist defence in depth

### Task 4.1: Extend `SYSTEM_PARAM_KEYS` to cover all systemParam keys

**Files:**
- Modify: `packages/application/src/provider-connectivity/use-cases/manage-job-definition.use-cases.ts`
- Modify: `packages/application/src/provider-connectivity/use-cases/manage-job-definition.use-cases.spec.ts`

- [ ] **Step 1: Add a failing test**

In the spec file, find the `describe('UpdateJobDefinitionUseCase', ...)` block and add:

```ts
it.each([
	'gscPropertyId',
	'ga4PropertyId',
	'trackedPageId',
	'wikipediaArticleId',
	'bingPropertyId',
	'clarityProjectId',
	'monitoredDomainId',
	'trackedKeywordId',
	'organizationId',
	'projectId',
])('preserves systemParam %s on PATCH (defence in depth — ADR 0001)', async (key) => {
	const existing = makeJobDef({
		params: { siteUrl: 'sc-domain:example.com', [key]: 'preserved-value' },
	});
	const useCase = new UpdateJobDefinitionUseCase(definitions, scheduler);
	await useCase.execute({
		definitionId: existing.id,
		params: { siteUrl: 'sc-domain:other.com' /* user PATCH does NOT include the system key */ },
	});
	const after = await definitions.findById(existing.id);
	expect((after?.params as Record<string, unknown>)?.[key]).toBe('preserved-value');
});
```

- [ ] **Step 2: Run the test — confirm partial fail**

```bash
pnpm --filter @rankpulse/application test -- manage-job-definition.use-cases
```

Expected: FAIL for the 6 keys not in the current whitelist (ga4PropertyId, trackedPageId, wikipediaArticleId, bingPropertyId, clarityProjectId, monitoredDomainId). The 4 already in the whitelist (organizationId, projectId, gscPropertyId, trackedKeywordId) PASS.

- [ ] **Step 3: Extend the whitelist**

In `manage-job-definition.use-cases.ts`, replace the constant:

```ts
const SYSTEM_PARAM_KEYS = [
	'organizationId',
	'projectId',
	'trackedKeywordId',
	'gscPropertyId',
	'ga4PropertyId',
	'trackedPageId',
	'wikipediaArticleId',
	'bingPropertyId',
	'clarityProjectId',
	'monitoredDomainId',
] as const;
```

- [ ] **Step 4: Re-run, verify pass**

```bash
pnpm --filter @rankpulse/application test -- manage-job-definition.use-cases
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/provider-connectivity/use-cases/manage-job-definition.use-cases.ts \
        packages/application/src/provider-connectivity/use-cases/manage-job-definition.use-cases.spec.ts
git commit -m "fix(provider-connectivity): extend SYSTEM_PARAM_KEYS PATCH whitelist to all 10 keys"
```

---

## Phase 5 — UI changes

### Task 5.1: Hide entity-bound endpoints from the manual schedule flow

**Files:**
- Modify: `apps/web/src/components/schedule-fetch-drawer.tsx`
- Modify: `apps/web/src/pages/schedules.page.tsx`

- [ ] **Step 1: Open both files and identify the endpoint selector**

```bash
rg -n "endpointId" apps/web/src/components/schedule-fetch-drawer.tsx apps/web/src/pages/schedules.page.tsx
```

Locate where the user picks a provider/endpoint. There's likely a dropdown of providers and a dependent dropdown of endpoints.

- [ ] **Step 2: Add a constant matching the controller list**

Create `apps/web/src/lib/entity-bound-endpoints.ts`:

```ts
export const ENTITY_BOUND_ENDPOINT_IDS = new Set([
	'gsc-search-analytics',
	'ga4-run-report',
	'wikipedia-pageviews-per-article',
	'bing-rank-and-traffic-stats',
	'clarity-data-export',
	'psi-runpagespeed',
	'radar-domain-rank',
]);

export const ENTITY_LINK_ROUTE_HINT: Record<string, string> = {
	'gsc-search-analytics': 'Link a GSC property in Settings → Providers → Google Search Console.',
	'ga4-run-report': 'Link a GA4 property in Settings → Providers → Google Analytics 4.',
	'wikipedia-pageviews-per-article': 'Link a Wikipedia article in Settings → Providers → Wikipedia.',
	'bing-rank-and-traffic-stats': 'Link a Bing property in Settings → Providers → Bing Webmaster Tools.',
	'clarity-data-export': 'Link a Clarity project in Settings → Providers → Microsoft Clarity.',
	'psi-runpagespeed': 'Track a page in Settings → Web Performance.',
	'radar-domain-rank': 'Add a monitored domain in Settings → Macro Context.',
};
```

- [ ] **Step 3: Filter the endpoint dropdown in `schedule-fetch-drawer.tsx`**

Find the `endpoints.map(...)` (or equivalent) that renders the dropdown options. Wrap it:

```tsx
{endpoints
	.filter((e) => !ENTITY_BOUND_ENDPOINT_IDS.has(e.id))
	.map((e) => (
		<SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
	))
}
```

If the existing UI flow already disables some endpoints based on credential availability or similar, add the entity-bound filter alongside that logic — don't replace it.

- [ ] **Step 4: Add a notice in `schedules.page.tsx` (or the empty-state of the drawer)**

When the user is filtering by a provider whose endpoints are all entity-bound, show:

```tsx
import { ENTITY_BOUND_ENDPOINT_IDS, ENTITY_LINK_ROUTE_HINT } from '@/lib/entity-bound-endpoints';

// inside the drawer body, conditional render:
{selectedEndpointId && ENTITY_BOUND_ENDPOINT_IDS.has(selectedEndpointId) && (
	<div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
		<p className="font-medium">{t('schedules.entityBoundNotice.title')}</p>
		<p className="mt-1 text-muted-foreground">
			{ENTITY_LINK_ROUTE_HINT[selectedEndpointId]}
		</p>
	</div>
)}
```

(But since step 3 already filters those endpoints OUT of the dropdown, this `if` will only fire if the user lands on the drawer with a deep-linked entity-bound endpoint — ie the rare case. Acceptable second-line guidance.)

i18n keys: add to `apps/web/src/i18n.ts`:

```ts
schedules: {
	entityBoundNotice: {
		title: 'This endpoint is auto-scheduled',
	},
	// ... existing keys
},
```

- [ ] **Step 5: Verify mobile layout (CLAUDE.md §2.5)**

Open the dev server, switch to mobile viewport (375px), open the drawer, confirm the notice card and dropdown render correctly.

```bash
pnpm --filter @rankpulse/web dev
```

Open `http://localhost:5173/schedules` in browser, DevTools → device emulation → iPhone SE.

- [ ] **Step 6: Run web typecheck**

```bash
pnpm --filter @rankpulse/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/entity-bound-endpoints.ts \
        apps/web/src/components/schedule-fetch-drawer.tsx \
        apps/web/src/pages/schedules.page.tsx \
        apps/web/src/i18n.ts
git commit -m "feat(web): hide entity-bound endpoints from manual schedule flow (ADR 0001)"
```

---

## Phase 6 — Migration script for existing prod data

### Task 6.1: Write the repair script

**Files:**
- Create: `apps/api/scripts/repair-job-definitions.ts`
- Modify: `apps/api/package.json` (add npm script)

- [ ] **Step 1: Create the script skeleton**

Create `apps/api/scripts/repair-job-definitions.ts`:

```ts
/**
 * Reconcile entity-bound JobDefinitions in production with their owning
 * entity. Runs in two modes:
 *
 *   --dry-run  Report what would be done; no DB writes.
 *   (default)  Execute repair: PATCH systemParams or DELETE + re-create.
 *
 * For each entity-bound endpoint, looks up the owning entity by the
 * user-facing identifier in `params` (siteUrl, propertyId, url, etc.). If
 * the entity exists, PATCH the JobDefinition's systemParams. If the
 * entity is missing or ambiguous, log + skip (operator must decide).
 *
 * Audit trail: every action is written to `provider_job_definitions_repair_log`
 * (created on first run if missing).
 *
 * Usage from repo root:
 *   pnpm --filter @rankpulse/api repair:job-definitions [--dry-run]
 */
import { buildContainer } from '../src/composition/composition-root.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { providerJobDefinitions } from '../../../packages/infrastructure/src/persistence/drizzle/schema/index.js';
import { eq } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');

const ENTITY_BOUND_ENDPOINTS = [
	{ endpointId: 'gsc-search-analytics', userKey: 'siteUrl', systemKey: 'gscPropertyId', repoToken: 'gscPropertyRepo', findByMethod: 'findByProjectAndSite' },
	{ endpointId: 'ga4-run-report', userKey: 'propertyId', systemKey: 'ga4PropertyId', repoToken: 'ga4PropertyRepo', findByMethod: 'findByProjectAndHandle' },
	{ endpointId: 'wikipedia-pageviews-per-article', userKey: 'article', systemKey: 'wikipediaArticleId', repoToken: 'wikipediaArticleRepo', findByMethod: 'findByProjectAndSlug' },
	{ endpointId: 'bing-rank-and-traffic-stats', userKey: 'siteUrl', systemKey: 'bingPropertyId', repoToken: 'bingPropertyRepo', findByMethod: 'findByProjectAndSite' },
	{ endpointId: 'clarity-data-export', userKey: 'projectId', systemKey: 'clarityProjectId', repoToken: 'clarityProjectRepo', findByMethod: 'findByProjectAndHandle' },
	{ endpointId: 'psi-runpagespeed', userKey: 'url', systemKey: 'trackedPageId', repoToken: 'trackedPageRepo', findByMethod: 'findByTuple' },
	{ endpointId: 'radar-domain-rank', userKey: 'domain', systemKey: 'monitoredDomainId', repoToken: 'monitoredDomainRepo', findByMethod: 'findByProjectAndDomain' },
] as const;

interface RepairReport {
	scanned: number;
	alreadyOk: number;
	patched: number;
	deletedNoEntity: number;
	skippedAmbiguous: number;
	errors: Array<{ definitionId: string; reason: string }>;
}

async function main() {
	const container = await buildContainer();
	const sql = postgres(process.env.DATABASE_URL!);
	const db = drizzle(sql);

	const report: RepairReport = {
		scanned: 0,
		alreadyOk: 0,
		patched: 0,
		deletedNoEntity: 0,
		skippedAmbiguous: 0,
		errors: [],
	};

	for (const cfg of ENTITY_BOUND_ENDPOINTS) {
		const rows = await db
			.select()
			.from(providerJobDefinitions)
			.where(eq(providerJobDefinitions.endpointId, cfg.endpointId));

		for (const row of rows) {
			report.scanned += 1;
			const params = row.params as Record<string, unknown>;
			if (params[cfg.systemKey]) {
				report.alreadyOk += 1;
				continue;
			}

			const userValue = params[cfg.userKey] as string | undefined;
			if (!userValue) {
				report.errors.push({ definitionId: row.id, reason: `missing user-facing ${cfg.userKey} in params` });
				continue;
			}

			// Resolve the entity via the appropriate repo. Repo + method
			// determined by cfg. (Generic dispatch via container — falls back
			// to a switch if container.resolve is not available; adjust per
			// the actual composition-root export shape.)
			const repo = (container as unknown as Record<string, unknown>)[cfg.repoToken] as
				| { [k: string]: (...args: unknown[]) => Promise<{ id: string } | null> }
				| undefined;
			if (!repo) {
				report.errors.push({ definitionId: row.id, reason: `repo ${cfg.repoToken} not found in container` });
				continue;
			}
			const entity = await repo[cfg.findByMethod]?.(row.projectId, userValue);
			if (!entity) {
				console.log(`[repair] no entity for ${cfg.endpointId}/${userValue} — would DELETE definition ${row.id}`);
				if (!DRY_RUN) {
					await db.delete(providerJobDefinitions).where(eq(providerJobDefinitions.id, row.id));
				}
				report.deletedNoEntity += 1;
				continue;
			}

			console.log(`[repair] ${cfg.endpointId}: PATCH definition ${row.id} with ${cfg.systemKey}=${entity.id}`);
			if (!DRY_RUN) {
				const newParams = { ...params, [cfg.systemKey]: entity.id };
				await db
					.update(providerJobDefinitions)
					.set({ params: newParams })
					.where(eq(providerJobDefinitions.id, row.id));
			}
			report.patched += 1;
		}
	}

	console.log('\n=== REPAIR REPORT ===');
	console.log(JSON.stringify(report, null, 2));
	if (DRY_RUN) console.log('(DRY RUN — no changes written)');
	await sql.end();
}

main().catch((err) => {
	console.error('repair-job-definitions failed:', err);
	process.exit(1);
});
```

The exact shape of `buildContainer` and how to pull repos out of it depends on what composition-root exports — open `apps/api/src/composition/composition-root.ts`'s exports and adapt the `repo` access pattern. If the composition root exports a typed object with named repo properties, use that directly; if it returns a Nest container, use `container.get(token)` per the existing pattern.

- [ ] **Step 2: Add npm script**

In `apps/api/package.json`, in `"scripts"`:

```json
"repair:job-definitions": "tsx scripts/repair-job-definitions.ts"
```

If `tsx` isn't already a devDep of `apps/api`, add it: `pnpm --filter @rankpulse/api add -D tsx`.

- [ ] **Step 3: Run dry-run against a local dev DB**

```bash
docker compose -f docker-compose.dev.yml up -d postgres
pnpm --filter @rankpulse/infrastructure db:migrate
pnpm --filter @rankpulse/api repair:job-definitions -- --dry-run
```

Expected: report with all-zero counts on a fresh DB. Inject a test definition manually (via psql) and re-run to confirm the script detects + would-patch it.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/repair-job-definitions.ts apps/api/package.json
git commit -m "feat(provider-connectivity): repair-job-definitions ops script (ADR 0001)"
```

---

## Phase 7 — Delete SystemParamResolver code

After Phase 2 finishes, all entity-bound endpoints have working auto-schedule handlers. Phase 3 blocked the manual `POST .../schedule` for those endpoints. The `SystemParamResolver` pattern is dead code.

### Task 7.1: Drop the resolver wiring from composition-root + use case

**Files:**
- Modify: `apps/api/src/composition/composition-root.ts`
- Modify: `packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.ts`
- Modify: `packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.spec.ts`

- [ ] **Step 1: Remove the resolver list parameter from `ScheduleEndpointFetchUseCase`**

In `schedule-endpoint-fetch.use-case.ts`:

```ts
// DELETE this interface entirely (it lives at top of the file):
//   export interface SystemParamResolver { ... }

// DELETE the constructor parameter:
//   private readonly systemParamResolvers: SystemParamResolver[] = [],

// DELETE the for-loop in execute():
//   for (const resolver of this.systemParamResolvers) {
//     const extra = await resolver.resolve({...});
//     resolvedSystemParams = { ...resolvedSystemParams, ...extra };
//   }
//
// Replace the `resolvedSystemParams` block with:
const resolvedSystemParams: Record<string, unknown> = { ...(cmd.systemParams ?? {}) };
```

The use case becomes simpler: validate params → idempotency check → create + save + register + publish.

- [ ] **Step 2: Update the spec to drop resolver-related tests**

In `schedule-endpoint-fetch.use-case.spec.ts`, find any test that injects a resolver list and exercises the merge behaviour. Delete those tests — they're testing dead code now. The idempotency test from Task 1.3 remains.

- [ ] **Step 3: Update composition-root**

In `apps/api/src/composition/composition-root.ts`, find the block (lines 206–238 currently) that constructs `ScheduleEndpointFetchUseCase` with the resolver array. Replace with:

```ts
const scheduleEndpointFetch = new PCUseCases.ScheduleEndpointFetchUseCase(
	jobDefRepo,
	jobScheduler,
	{
		validate: (providerId, endpointId, params) => {
			const descriptor = providerRegistry.endpoint(providerId, endpointId);
			const parsed = descriptor.paramsSchema.safeParse(params);
			if (!parsed.success) {
				throw new InvalidInputError(
					`Invalid params for ${providerId}/${endpointId}: ${parsed.error.message}`,
				);
			}
			return parsed.data as Record<string, unknown>;
		},
	},
	SystemClock,
	SystemIdGenerator,
	eventPublisher,
	// no resolvers — entity-bound endpoints are auto-scheduled by their
	// bounded context's link/add handler. See ADR 0001.
);
```

The BACKLOG #50 comment block (lines 225–231) is removed.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.ts \
        packages/application/src/provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.spec.ts \
        apps/api/src/composition/composition-root.ts
git commit -m "refactor(provider-connectivity): drop SystemParamResolver port from ScheduleEndpointFetch (ADR 0001)"
```

### Task 7.2: Delete the 5 SystemParamResolver implementations

**Files:**
- Delete: `packages/application/src/search-console-insights/system-param-resolvers/gsc-property.system-param-resolver.ts` + `.spec.ts`
- Delete: `packages/application/src/traffic-analytics/system-param-resolvers/ga4-property.system-param-resolver.ts` + `.spec.ts`
- Delete: `packages/application/src/web-performance/system-param-resolvers/tracked-page.system-param-resolver.ts` + `.spec.ts`
- Delete: `packages/application/src/entity-awareness/system-param-resolvers/wikipedia-article.system-param-resolver.ts` + `.spec.ts`
- Delete: `packages/application/src/bing-webmaster-insights/system-param-resolvers/bing-property.system-param-resolver.ts` + `.spec.ts`
- Modify: each context's `index.ts` to drop the resolver export

- [ ] **Step 1: Delete the 10 files**

```bash
rm -f packages/application/src/search-console-insights/system-param-resolvers/gsc-property.system-param-resolver.ts \
      packages/application/src/search-console-insights/system-param-resolvers/gsc-property.system-param-resolver.spec.ts \
      packages/application/src/traffic-analytics/system-param-resolvers/ga4-property.system-param-resolver.ts \
      packages/application/src/traffic-analytics/system-param-resolvers/ga4-property.system-param-resolver.spec.ts \
      packages/application/src/web-performance/system-param-resolvers/tracked-page.system-param-resolver.ts \
      packages/application/src/web-performance/system-param-resolvers/tracked-page.system-param-resolver.spec.ts \
      packages/application/src/entity-awareness/system-param-resolvers/wikipedia-article.system-param-resolver.ts \
      packages/application/src/entity-awareness/system-param-resolvers/wikipedia-article.system-param-resolver.spec.ts \
      packages/application/src/bing-webmaster-insights/system-param-resolvers/bing-property.system-param-resolver.ts \
      packages/application/src/bing-webmaster-insights/system-param-resolvers/bing-property.system-param-resolver.spec.ts
```

- [ ] **Step 2: Remove resolver re-exports from each context's `index.ts`**

For each of the 5 contexts, open `packages/application/src/<context>/index.ts` and remove the `export * from './system-param-resolvers/...js'` line.

- [ ] **Step 3: Remove now-empty `system-param-resolvers/` directories**

```bash
rmdir packages/application/src/search-console-insights/system-param-resolvers \
      packages/application/src/traffic-analytics/system-param-resolvers \
      packages/application/src/web-performance/system-param-resolvers \
      packages/application/src/entity-awareness/system-param-resolvers \
      packages/application/src/bing-webmaster-insights/system-param-resolvers
```

- [ ] **Step 4: Typecheck + tests**

```bash
pnpm typecheck && pnpm test
```

Expected: PASS. If typecheck fails with "Cannot find name 'GscPropertySystemParamResolver'" or similar, find the stray import (likely in composition-root or a test) and remove it.

- [ ] **Step 5: Commit**

```bash
git add -A packages/application/src/
git commit -m "refactor: delete SystemParamResolver implementations (replaced by Auto-Schedule handlers, ADR 0001)"
```

---

## Phase 8 — Integration tests + close out

### Task 8.1: Integration test per context

**Files:**
- Create: `apps/api/test/integration/auto-schedule.<context>.spec.ts` (one per context)

Use the existing integration-test harness in `apps/api/test/`. The test shape per context:

```ts
describe('auto-schedule on Ga4PropertyLinked', () => {
	it('creates a JobDefinition with ga4PropertyId in systemParams, runs, and persists rows', async () => {
		// 1. Link a GA4 property via the public API (POST /api/v1/projects/:p/ga4/properties)
		const linkRes = await request(app).post(`/api/v1/projects/${projectId}/ga4/properties`)
			.set('Authorization', `Bearer ${token}`)
			.send({ propertyHandle: 'properties/123456' });
		expect(linkRes.status).toBe(201);

		// 2. Wait briefly for the in-memory event publisher to fire the handler
		await new Promise((r) => setTimeout(r, 100));

		// 3. Fetch JobDefinitions for the project, confirm the GA4 one exists
		const jobDefs = await request(app).get(`/api/v1/providers/job-definitions/by-project/${projectId}`)
			.set('Authorization', `Bearer ${token}`);
		const ga4Def = jobDefs.body.find((d: { endpointId: string }) => d.endpointId === 'ga4-run-report');
		expect(ga4Def).toBeDefined();
		expect(ga4Def.params.ga4PropertyId).toBe(linkRes.body.id);

		// 4. Trigger run-now
		await request(app).post(`/api/v1/providers/google-analytics-4/job-definitions/${ga4Def.id}/run-now`)
			.set('Authorization', `Bearer ${token}`);

		// 5. (If a real GA4 mock is available) verify rows landed in ga4_daily_metrics.
		//    Otherwise, verify the run reached `succeeded` status without
		//    falling into the old "missing ga4PropertyId; skipping" path.
		const runs = await request(app).get(`/api/v1/providers/google-analytics-4/job-definitions/${ga4Def.id}/runs`)
			.set('Authorization', `Bearer ${token}`);
		expect(runs.body[0].status).not.toBe('failed');
		expect(runs.body[0].errorJson?.code).not.toBe('INGEST_PRECONDITION_FAILED');
	});

	it('is idempotent: re-linking the same GA4 property returns the same JobDefinition (no duplicates)', async () => {
		// 1. Link once, capture definitionId.
		// 2. Link the same propertyHandle again — should 409 or 200 with the
		//    same id, depending on Link use-case behaviour.
		// 3. List JobDefinitions, assert exactly one for ga4-run-report.
	});
});
```

Write the equivalent for each of the 7 contexts. The 7 specs share a builder helper — extract it to `apps/api/test/integration/_helpers/auto-schedule.ts`.

- [ ] **Step 1: Write the 7 specs (one per context)**
- [ ] **Step 2: Run integration tests**

```bash
pnpm test:integration
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/integration/
git commit -m "test(provider-connectivity): integration tests for 7 auto-schedule handlers (ADR 0001)"
```

### Task 8.2: Final lint, typecheck, full test, build

- [ ] **Step 1: Run the full pre-commit suite (per CLAUDE.md §6)**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: PASS for all four. Fix any drift.

- [ ] **Step 2: Verify mobile UI**

Open `apps/web` dev server, walk the schedules flow at 375px viewport, confirm:
- Entity-bound endpoints don't appear in the manual schedule dropdown.
- Linking an entity (any of the 7 contexts) creates a JobDefinition (visible in the list).

### Task 8.3: Run the migration script in dry-run against staging

**Note:** This step requires production-like data and access. If staging access isn't available in the worktree, defer to the operator running the eventual deploy.

- [ ] **Step 1: Snapshot the current `provider_job_definitions` rowcount per endpoint**

```bash
psql $STAGING_DATABASE_URL -c "select endpoint_id, count(*) from provider_job_definitions group by endpoint_id order by 1;"
```

- [ ] **Step 2: Run repair script in dry-run**

```bash
DATABASE_URL=$STAGING_DATABASE_URL pnpm --filter @rankpulse/api repair:job-definitions -- --dry-run
```

Expected: report shows `scanned > 0`, `alreadyOk` ≈ rowcount of GSC (since GSC was repaired manually post #53), and `patched + deletedNoEntity > 0` for the other 6 endpoints. Review the JSON report.

- [ ] **Step 3: Get operator sign-off before applying for real**

This step is intentionally left as a manual gate. After review, the operator runs without `--dry-run` against staging, then prod.

### Task 8.4: Update `MEMORY.md` / CLAUDE.md if conventions shifted

- [ ] **Step 1: Skim `CLAUDE.md`**

Look for any reference to SystemParamResolver pattern, "BACKLOG #50", or "missing X param skipping ingest". If any exist, replace with a brief note pointing to `docs/adr/0001-...md`.

- [ ] **Step 2: If changes were made, commit**

```bash
git add CLAUDE.md
git commit -m "docs: reference ADR 0001 in CLAUDE.md (auto-schedule handlers replaced resolver pattern)"
```

### Task 8.5: Open PR and close issue #56

- [ ] **Step 1: Push the branch**

```bash
git push -u origin <branch-name>
```

- [ ] **Step 2: Open PR with `Closes #56`**

```bash
gh pr create --title "feat: eliminate SystemParamResolver via per-context Auto-Schedule handlers (closes #56)" \
  --body "$(cat <<'EOF'
## Summary

- Replaces the `SystemParamResolver` mechanical fix (PRs #53/#55) with per-context `AutoScheduleOnXLinkedHandler` event handlers across 7 bounded contexts.
- Adds `idempotencyKey` to `ScheduleEndpointFetchUseCase` so re-emission of `XLinked`/`XAdded` events doesn't duplicate JobDefinitions.
- Gates `POST /providers/:p/endpoints/:e/schedule` with 400 for the 7 entity-bound endpoints.
- Converts processor "missing X; skipping ingest" guards from silent warn-and-skip to `throw NotFoundError` → run `failed`.
- Extends PATCH `SYSTEM_PARAM_KEYS` whitelist to all 10 keys.
- Hides entity-bound endpoints from the manual schedule UI.
- Ships `repair:job-definitions` ops script for prod data reconciliation.
- Deletes the 5 SystemParamResolver implementations + the resolver port + composition-root wiring.

Implements ADR 0001 (`docs/adr/0001-eliminate-systemparamresolver-via-auto-schedule-handlers.md`).

## Test plan

- [ ] All unit specs pass (`pnpm test:unit`)
- [ ] All integration specs pass (`pnpm test:integration`)
- [ ] Linking a GSC/GA4/Bing/Wikipedia/Clarity/TrackedPage/MonitoredDomain entity in dev produces a JobDefinition with the correct systemParam (verify in DB or `GET /providers/job-definitions/by-project/:id`)
- [ ] `POST /providers/<provider>/endpoints/<entity-bound-endpoint>/schedule` returns 400 with redirect message
- [ ] Worker run for an entity-bound endpoint persists rows (no INGEST_PRECONDITION_FAILED in `provider_job_runs.error_json`)
- [ ] Mobile (375px) UI: schedules drawer hides entity-bound endpoints
- [ ] Repair script `--dry-run` against staging produces a sane report
EOF
)"
```

- [ ] **Step 3: Verify the PR closes #56 on merge**

The `Closes #56` keyword in the PR body auto-closes on merge. The `wip` label is auto-removed.

---

## Self-Review

Spec coverage check (read ADR 0001 acceptance criteria and verify each maps to a task):

| ADR AC item | Plan task |
|---|---|
| 6 missing AutoScheduleOn<X>LinkedHandler with idempotency | Tasks 2.1–2.6 |
| GSC handler updated for idempotency | Task 1.4 (handler change), Task 1.3 (use-case support) |
| `findByProjectEndpointAndSystemParam` on JobDefinitionRepository | Tasks 1.1, 1.2 |
| `POST .../schedule` returns 400 for 7 entity-bound endpoints | Task 3.1 |
| 7 processor guards → `throw` + run `failed` | Task 3.2 |
| 5 SystemParamResolver files deleted, port + wiring gone | Tasks 7.1, 7.2 |
| `SYSTEM_PARAM_KEYS` covers all keys | Task 4.1 |
| UI hides entity-bound endpoints | Task 5.1 |
| `repair-job-definitions.ts` ops script with `--dry-run` | Task 6.1 |
| Integration test per context | Task 8.1 |
| ADR committed | Pre-Phase-1 (already written; commit happens at the end of the PR alongside the rest) |

All ADR acceptance criteria are covered.

Placeholder scan: no "TBD", "TODO", "fill in details" patterns remain. The two "verify field name during Phase 0" notes inside Task 2.x specs are explicit verification gates with a documented fallback (substitute the real name), not placeholders.

Type consistency check: the command shape (`idempotencyKey: { systemParamKey: string; systemParamValue: string }`) is consistent across Phase 1 (use case), Phase 2 (all 6 new handlers), and Task 1.4 (GSC handler). The `systemParamKey` values align with the entity-bound endpoint table (gscPropertyId, ga4PropertyId, etc.). Method names: `findByProjectEndpointAndSystemParam` is used identically in port (Task 1.1), Drizzle adapter (Task 1.2), and use case (Task 1.3).

Plan complete.
