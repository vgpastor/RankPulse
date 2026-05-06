# Design — Tema A: Provider Extension Platform

**Status:** Approved (autonomous design per maintainer delegation 2026-05-06)
**Companion ADR:** [`docs/adr/0002-provider-extension-platform.md`](../../adr/0002-provider-extension-platform.md)
**Tracking issue:** [#93](https://github.com/vgpastor/RankPulse/issues/93)

## Goal

Reduce the cost of adding a new provider or bounded context from "edit ~7 files across api, worker, composition, ingest, openapi, sdk" to "1 manifest export + 1 line in the registry array".

The current architecture leaks per-provider concerns across many files. Today, adding a new provider touches:

- A new `packages/providers/<x>/` package (correct).
- A new `<X>ApiError extends Error` class (one-of, ~50 LOC of pure boilerplate).
- A new `http.ts` file (~80–120 LOC, ~70% duplicated across providers).
- A new repository class per entity (~80 LOC each, ~80% duplicated).
- A new auto-schedule handler per `XLinked` event (~80 LOC each, ~80% duplicated).
- A new processor block in `apps/worker/src/processors/provider-fetch.processor.ts` (~50 LOC).
- A new wiring block in `apps/api/src/composition/composition-root.ts` (~30 LOC).
- A new wiring block in `apps/worker/src/main.ts` (~30 LOC — same wiring duplicated).
- A new schema fragment in the 1175-LOC `schema/index.ts`.
- A new entry in `apps/api/src/openapi/spec.ts` (out of scope this refactor — Tema C).
- A new resource in `packages/sdk/src/resources/` (out of scope — Tema C).

After this refactor:

- The provider exports a `ProviderManifest` from its package's `index.ts`.
- Its bounded-context counterpart exports a `ContextModule` from its application package.
- One line each in `apps/api/src/composition/manifests.ts` and `modules.ts`.
- composition-root and worker main both iterate the lists; per-provider wiring code is gone.

## Scope

This is **Tema A + A5** from the architectural audit (2026-05-06):

- **A1** — Provider HTTP foundation: `BaseHttpClient` + unified `ProviderApiError`.
- **A2** — Auto-Schedule Handler Registry: 10 near-duplicate handlers collapse to a config-driven factory.
- **A3** — Worker Processor → Ingest Router: 818-LOC dispatch monolith becomes a thin `IngestRouter` driven by `ProviderManifest.endpoints[].ingest`.
- **A4** — composition-root + worker main modularization: 793-LOC + 290-LOC both become ~150 LOC iterating manifests/modules.
- **A5** — Persistence cleanup: split `schema/index.ts` per context, extract `DrizzleRepository<T>` base class.

Out of scope (separate themes, follow-up issues):

- **Tema C** — OpenAPI auto-derivation + SDK auto-generation.
- **Tema D** — Outbox pattern for cross-process events (replace `InMemoryEventPublisher`).
- **Tema E** — Frontend templates (`<ResourcePage>`, `<FormDrawer>`, `queryKeys.ts`).

The PR is one consolidated change with **ordered commits keeping the branch buildable throughout**. See "Migration path" below.

## Section 1 — Core abstractions

### `SharedDeps` — what composition injects into every context module

Lives in `apps/api/src/composition/shared-deps.ts` (and re-used by `apps/worker/src/main.ts`).

```ts
export interface SharedDeps {
	drizzle: DrizzleClient;
	redis: { url: string };
	clock: Clock;
	ids: IdGenerator;
	events: EventPublisher;
	logger: Logger; // pino root; modules call logger.child({ context: 'meta' })
	scheduleEndpointFetch: ScheduleEndpointFetchUseCase; // the only cross-cutting use case
	passwordHasher: PasswordHasher;
	credentialVault: CredentialVault;
	jwtService: JwtService;
	apiTokenGenerator: ApiTokenGenerator;
}
```

Decisions:

- **No domain repos** in `SharedDeps`. Each context module constructs its own from `deps.drizzle`.
- **No use cases** except `scheduleEndpointFetch` (genuinely cross-context — every auto-schedule handler invokes it).
- **`logger` = pino**. Replaces the inline `console.log/error` thunks in current composition-root.
- **`events` = `EventPublisher` port**, not the impl. When Tema D ships, swap the adapter; modules unchanged.

### `ProviderManifest` — pure data + pure functions describing a provider

Lives in `packages/providers/core/src/manifest.ts` (new file). Replaces the current `Provider` interface.

```ts
import type { ZodTypeAny } from 'zod';
import type { ProviderConnectivity } from '@rankpulse/domain';

export interface ProviderManifest {
	id: string;
	displayName: string;
	http: HttpConfig;
	endpoints: readonly EndpointManifest[];
	/**
	 * Per-provider credential format check. Called by
	 * RegisterProviderCredentialUseCase before encrypting + persisting, so
	 * misconfigured credentials surface as 400 at registration time, not as
	 * a worker failure on the first run. Throws InvalidInputError on mismatch.
	 */
	validateCredentialPlaintext(plaintextSecret: string): void;
}

export interface HttpConfig {
	baseUrl: string;
	auth: AuthStrategy;
	defaultTimeoutMs?: number; // default 60_000
	defaultRetries?: number; // default 0; HTTP-level retries handled by BullMQ on throw
}

export type AuthStrategy =
	| { kind: 'bearer-token' } // OpenAI, Anthropic, Perplexity, Brevo
	| { kind: 'api-key-header'; headerName: string } // Clarity (Authorization: <key>), Cloudflare Radar
	| { kind: 'basic' } // DataForSEO ('email|password')
	| { kind: 'oauth-token' } // Meta long-lived token
	| { kind: 'service-account-jwt' } // GSC, GA4, PageSpeed (Google JWT exchange)
	| { kind: 'api-key-or-service-account-jwt' } // PageSpeed polymorphic (post-#66)
	| { kind: 'custom'; sign: (req: HttpRequest, plaintextSecret: string) => HttpRequest };

export interface EndpointManifest<TParams = unknown, TResponse = unknown> {
	descriptor: EndpointDescriptor; // existing type from provider-core/types.ts
	fetch: (http: HttpClient, params: TParams, ctx: FetchContext) => Promise<TResponse>;
	ingest: IngestBinding<TResponse> | null; // null = raw-only (e.g. meta-custom-audiences)
}

export interface IngestBinding<TResponse = unknown> {
	/** Token used to look up an IngestUseCase from the merged registrations. */
	useCaseKey: string; // e.g. 'meta:pixel-events-ingest'
	/** systemParam key the IngestRouter verifies before dispatching. */
	systemParamKey: string; // e.g. 'metaPixelId'
	/** Pure function: provider response → domain rows. */
	acl: (response: TResponse, ctx: AclContext) => unknown[];
}

export interface AclContext {
	dateBucket: string; // YYYY-MM-DD resolved by the worker
	systemParams: Record<string, unknown>; // includes the resolved entityId
	endpointParams: Record<string, unknown>; // user-facing params (some ACLs need e.g. `level` for ads-insights)
}
```

The existing `EndpointDescriptor` and `FetchContext` from `provider-core/types.ts` are preserved as-is.

The current `Provider` interface is **deleted** in favour of `ProviderManifest`. The `ProviderRegistry` is updated to store manifests directly.

### `ContextModule` — factory pattern for a bounded context

Lives in `packages/application/core/src/module.ts` (new file).

```ts
export interface ContextModule {
	id: string; // bounded-context name, e.g. 'meta-ads-attribution'
	compose: (deps: SharedDeps) => ContextRegistrations;
}

export interface ContextRegistrations {
	useCases: Record<string, unknown>; // exposed under DI tokens for controllers
	ingestUseCases: Record<string, IngestUseCase>; // resolved by ProviderManifest's ingest.useCaseKey
	eventHandlers: readonly EventHandler[];
	schemaTables: readonly PgTable[]; // collected in step 2; informational today, hooks future per-context test-schema setup
}

export interface IngestUseCase {
	execute(input: {
		rawPayloadId: string;
		rows: unknown[];
		systemParams: Record<string, unknown>;
	}): Promise<void>;
}

export interface EventHandler {
	events: readonly string[]; // event types this handler subscribes to
	handle: (event: DomainEvent) => Promise<void>;
}
```

### Composition root after refactor

```ts
// apps/api/src/composition/composition-root.ts — drops from 793 LOC to ~150
import { providerManifests } from './manifests.js';
import { contextModules } from './modules.js';

export function buildCompositionRoot(env: AppEnv): BootstrapResult {
	const sharedDeps = buildSharedDeps(env);

	const contextRegs = contextModules.map((m) => ({ id: m.id, regs: m.compose(sharedDeps) }));

	const ingestUseCases: Record<string, IngestUseCase> = {};
	for (const { regs } of contextRegs) Object.assign(ingestUseCases, regs.ingestUseCases);

	const providerRegistry = new ProviderRegistry();
	for (const m of providerManifests) providerRegistry.register(m);

	for (const { regs } of contextRegs) {
		for (const handler of regs.eventHandlers) {
			for (const eventType of handler.events) {
				sharedDeps.events.on(eventType, handler.handle);
			}
		}
	}

	const ingestRouter = buildIngestRouter(providerManifests, ingestUseCases);

	const providers = buildNestProvidersFromRegistrations(
		contextRegs,
		sharedDeps,
		providerRegistry,
		ingestRouter,
	);

	return { providers, close: async () => sharedDeps.drizzle.close() };
}
```

The worker (`apps/worker/src/main.ts`) follows the same pattern, using the same `SharedDeps` factory and the same `contextModules` list. The 290 LOC of duplicated wiring drops to ~80 LOC focused on Worker-specific concerns (BullMQ workers, health server).

## Section 2 — HTTP / error foundation (A1)

### `BaseHttpClient`

Lives in `packages/providers/core/src/http-base.ts` (new file).

```ts
export abstract class BaseHttpClient {
	constructor(
		protected readonly providerId: string,
		protected readonly config: HttpConfig,
	) {}

	async get<TResponse>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<TResponse> {
		return this.request<TResponse>('GET', path, query, undefined, ctx);
	}

	async post<TResponse>(
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<TResponse> {
		return this.request<TResponse>('POST', path, query, body, ctx);
	}

	private async request<TResponse>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<TResponse> {
		const url = this.buildUrl(path, query);
		const internal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internal);

		const init: RequestInit = { method, signal, headers: this.applyAuth(ctx.credential.plaintextSecret, body) };
		if (body !== undefined) init.body = JSON.stringify(body);

		let response: Response;
		try {
			response = await fetch(url, init);
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				throw new ProviderApiError(this.providerId, 0, undefined, 'request timed out or aborted');
			}
			throw new ProviderApiError(this.providerId, 0, undefined, `network error: ${(err as Error).message}`);
		}

		if (!response.ok) {
			const text = await safeText(response);
			throw new ProviderApiError(
				this.providerId,
				response.status,
				text,
				`${this.providerId} ${method} ${path} → ${response.status}`,
			);
		}

		return this.parseResponse<TResponse>(response);
	}

	/** Subclasses can override for non-JSON or wrapped responses. */
	protected async parseResponse<TResponse>(response: Response): Promise<TResponse> {
		const text = await response.text();
		try {
			return JSON.parse(text) as TResponse;
		} catch {
			throw new ProviderApiError(this.providerId, 200, text, 'response body is not JSON');
		}
	}

	protected abstract applyAuth(plaintextSecret: string, body: unknown): Record<string, string>;
	protected abstract buildUrl(path: string, query: Record<string, string>): string;
}
```

The `applyAuth` and `buildUrl` hooks let providers customize without re-implementing the timeout/error/retry logic. For the standard auth strategies (`bearer-token`, `api-key-header`, `basic`, `oauth-token`), `BaseHttpClient` provides default `applyAuth` implementations selected by `HttpConfig.auth.kind`. Providers only override when they need custom behaviour (e.g. DataForSEO, GSC service-account JWT exchange).

### `ProviderApiError` — unified error type

Lives in `packages/providers/core/src/error.ts` (new file).

```ts
export class ProviderApiError extends Error {
	readonly code = 'PROVIDER_API_ERROR' as const;

	constructor(
		readonly providerId: string,
		readonly status: number, // HTTP status; 0 if network/timeout
		readonly body: string | undefined, // raw response body (truncated to 4 KB)
		message: string,
	) {
		super(message);
		this.name = 'ProviderApiError';
	}
}

export function isQuotaExhaustedError(err: unknown): boolean {
	return err instanceof ProviderApiError && (err.status === 429 || err.status === 402);
}
```

Replaces the 14 separate `<X>ApiError` classes and the 11-branch `instanceof` chain in the worker processor.

Per-provider quota nuances (e.g. Brevo's 300/day, OpenAI's "key revoked"):

- For most providers, `429 || 402` covers the quota-exhausted semantic. The unified `isQuotaExhaustedError` is sufficient.
- For providers with custom semantics (e.g. status `401` meaning "key revoked, must re-link"), the `ProviderManifest` exposes an optional `isQuotaExhausted?: (err: ProviderApiError) => boolean` hook that overrides the default. This keeps the unified type while allowing per-provider behaviour.

## Section 3 — Auto-Schedule Registry + Worker IngestRouter (A2 + A3)

### `buildAutoScheduleHandlers(deps, configs): EventHandler[]`

Lives in `packages/application/core/src/auto-schedule.ts` (new file).

```ts
export interface AutoScheduleConfig<TEvent extends DomainEvent = DomainEvent> {
	event: string;
	/** Single-schedule case (most common). */
	schedule?: AutoScheduleSpec<TEvent>;
	/** Multi-schedule fan-out (MetaAdAccountLinked → 2 schedules). */
	schedules?: readonly AutoScheduleSpec<TEvent>[];
	/** Dynamic fan-out (BrandPromptCreated → 4 providers × N locales). */
	dynamicSchedules?: (event: TEvent, deps: SharedDeps) => Promise<readonly AutoScheduleSpec<TEvent>[]>;
}

export interface AutoScheduleSpec<TEvent = DomainEvent> {
	providerId: string;
	endpointId: string;
	cron: string;
	systemParamKey: string;
	paramsBuilder: (event: TEvent) => Record<string, unknown>; // user-facing params
	systemParamsBuilder: (event: TEvent) => Record<string, unknown>; // org/entity ids; must include systemParamKey
}

export function buildAutoScheduleHandlers(
	deps: SharedDeps,
	configs: readonly AutoScheduleConfig[],
): EventHandler[];
```

Each config produces ONE `EventHandler`. The handler:

1. Returns early when `event.type !== config.event`.
2. Resolves the schedules to fire (single, list, or dynamic).
3. For each schedule, calls `deps.scheduleEndpointFetch.execute(...)` with idempotencyKey = `{ systemParamKey, systemParamValue: <from systemParamsBuilder> }`.
4. Errors per-schedule are logged (via `deps.logger.child({ context, event })`); never propagated.
5. Multi-schedule cases use `Promise.all` so one failure doesn't abort siblings (preserves existing `AutoScheduleOnMetaAdAccountLinkedHandler` behaviour).

Migration impact: deletes 10 standalone handler files in `packages/application/src/<context>/event-handlers/`. Their logic moves into the config entries inside each `ContextModule.compose(deps)`.

### `IngestRouter`

Lives in `apps/worker/src/processors/ingest-router.ts` (new file).

```ts
type ProviderEndpointKey = `${string}|${string}`;

export interface IngestRouterEntry {
	systemParamKey: string;
	acl: (response: unknown, ctx: AclContext) => unknown[];
	ingest: IngestUseCase;
}

export class IngestRouter {
	constructor(private readonly entries: ReadonlyMap<ProviderEndpointKey, IngestRouterEntry>) {}

	async dispatch(input: {
		providerId: string;
		endpointId: string;
		fetchResult: unknown;
		rawPayloadId: string;
		definition: ProviderJobDefinition;
		dateBucket: string;
	}): Promise<void> {
		const key: ProviderEndpointKey = `${input.providerId}|${input.endpointId}`;
		const entry = this.entries.get(key);
		if (!entry) return; // raw-only endpoint or unknown — caller already persisted raw payload

		const { systemParamKey, acl, ingest } = entry;
		const params = input.definition.params as Record<string, unknown>;
		const systemParamValue = params[systemParamKey];
		if (!systemParamValue) {
			throw new NotFoundError(
				`${input.providerId}/${input.endpointId} processor reached without ${systemParamKey} in systemParams. ` +
					`Auto-Schedule handler should have set this. See ADR 0001.`,
			);
		}

		const rows = acl(input.fetchResult, {
			dateBucket: input.dateBucket,
			systemParams: params,
			endpointParams: params,
		});

		await ingest.execute({
			rawPayloadId: input.rawPayloadId,
			rows,
			systemParams: params,
		});
	}
}

export function buildIngestRouter(
	manifests: readonly ProviderManifest[],
	ingestUseCases: Record<string, IngestUseCase>,
): IngestRouter {
	const entries = new Map<ProviderEndpointKey, IngestRouterEntry>();
	for (const manifest of manifests) {
		for (const endpoint of manifest.endpoints) {
			if (!endpoint.ingest) continue; // raw-only
			const key: ProviderEndpointKey = `${manifest.id}|${endpoint.descriptor.id}`;
			const useCase = ingestUseCases[endpoint.ingest.useCaseKey];
			if (!useCase) {
				throw new Error(
					`IngestRouter: no IngestUseCase registered for key '${endpoint.ingest.useCaseKey}' (provider ${manifest.id}, endpoint ${endpoint.descriptor.id})`,
				);
			}
			entries.set(key, {
				systemParamKey: endpoint.ingest.systemParamKey,
				acl: endpoint.ingest.acl as (r: unknown, ctx: AclContext) => unknown[],
				ingest: useCase,
			});
		}
	}
	return new IngestRouter(entries);
}
```

### `provider-fetch.processor.ts` after refactor

The processor's responsibility shrinks to:

1. Resolve the JobDefinition.
2. Resolve the credential.
3. Validate params via the descriptor's `paramsSchema`.
4. Call `provider.fetch(endpointId, params, ctx)` (still the existing API on `ProviderManifest`).
5. Persist the raw payload + dedup via `paramsHash`.
6. Call `ingestRouter.dispatch(...)`.
7. Mark the run succeeded / failed / quota-paused.

Estimated LOC: 250 (down from 818). The 12 if-else dispatch blocks disappear.

The processor's deps shrink from ~25 to:

```ts
interface ProviderFetchProcessorDeps {
	registry: ProviderRegistry;
	credentialRepo: CredentialRepository;
	jobDefRepo: JobDefinitionRepository;
	jobRunRepo: JobRunRepository;
	rawPayloadRepo: RawPayloadRepository;
	apiUsageRepo: ApiUsageRepository;
	resolveCredentialUseCase: ResolveProviderCredentialUseCase;
	recordApiUsageUseCase: RecordApiUsageUseCase;
	ingestRouter: IngestRouter; // collapses 14+ ingest-use-case deps into one
	vault: CredentialVault;
	clock: Clock;
	ids: IdGenerator;
	logger: Logger;
}
```

## Section 4 — Schema split + DrizzleRepository<T> (A5)

### Schema split

`packages/infrastructure/src/persistence/drizzle/schema/index.ts` (1175 LOC) splits into per-context files:

```
packages/infrastructure/src/persistence/drizzle/schema/
  ├─ identity-access.ts       (organizations, users, memberships, apiTokens)
  ├─ project-management.ts    (projects, projectDomains, projectLocations, keywordLists, keywords, competitors, competitorSuggestions, portfolios)
  ├─ rank-tracking.ts         (trackedKeywords, rankingObservations)
  ├─ search-console-insights.ts (gscProperties, gscObservations)
  ├─ traffic-analytics.ts     (ga4Properties, ga4DailyMetrics)
  ├─ web-performance.ts       (trackedPages, pageSpeedSnapshots)
  ├─ entity-awareness.ts      (wikipediaArticles, wikipediaPageviews)
  ├─ bing-webmaster-insights.ts (bingProperties, bingTrafficObservations)
  ├─ macro-context.ts         (monitoredDomains, radarRankSnapshots)
  ├─ experience-analytics.ts  (clarityProjects, experienceSnapshots)
  ├─ ai-search-insights.ts    (brandPrompts, llmAnswers)
  ├─ meta-ads-attribution.ts  (metaPixels, metaAdAccounts, metaPixelEventsDaily, metaAdsInsightsDaily)
  ├─ provider-connectivity.ts (providerCredentials, providerJobDefinitions, providerJobRuns, rawPayloads, apiUsageEntries)
  └─ index.ts                 (barrel: re-exports all per-context modules; <30 LOC)
```

drizzle-kit detects tables from any pgTable export — the split doesn't break migration generation. Verified pre-merge via `pnpm --filter @rankpulse/infrastructure db:generate` (must produce zero diff).

`ContextModule.compose()` returns `schemaTables: readonly PgTable[]` — currently informational, future use for partial-schema test setup or per-context migrations.

### `DrizzleRepository<T>`

Lives in `packages/infrastructure/src/persistence/drizzle/repositories/_base.ts` (new file).

```ts
import type { AnyPgTable, PgTableWithColumns } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../client.js';

export abstract class DrizzleRepository<TAggregate, TRow extends { id: string }> {
	constructor(
		protected readonly db: DrizzleDatabase,
		protected readonly table: PgTableWithColumns<{ name: string; schema: undefined; columns: { id: { name: 'id'; columnType: 'PgUUID'; data: string } } }>,
	) {}

	async findById(id: string): Promise<TAggregate | null> {
		const rows = await this.db
			.select()
			.from(this.table)
			.where(eq((this.table as unknown as { id: { name: 'id' } }).id, id))
			.limit(1);
		const row = rows[0] as TRow | undefined;
		return row ? this.toAggregate(row) : null;
	}

	protected abstract toAggregate(row: TRow): TAggregate;
}
```

Covers the universal `findById` pattern. `save`, `delete`, and complex queries stay in subclasses (they often need `ON CONFLICT DO UPDATE`, projections, time-series filters).

Migration: 38 repos. Each is converted in a separate commit.

## Section 5 — Migration path

Ordered commits, each keeping `pnpm typecheck && pnpm test && pnpm build` green.

1. **Foundation classes (no consumers yet)**
   - Add `BaseHttpClient`, `ProviderApiError`, `isQuotaExhaustedError` to `provider-core`.
   - Add `ProviderManifest` and related types to `provider-core`.
   - Add `ContextModule`, `IngestUseCase`, `EventHandler`, `ContextRegistrations` types to a new `application/core` package.
   - Add `buildAutoScheduleHandlers` to `application/core`.
   - Add `IngestRouter` and `buildIngestRouter` to a new `worker/core` location.
   - Add `DrizzleRepository<T>` base class to `infrastructure/persistence/drizzle/repositories/_base.ts`.
   - Tests for each new abstraction (unit-level).

2. **Schema split**
   - Move tables from monolithic `schema/index.ts` into per-context files.
   - `schema/index.ts` becomes a barrel re-exporting all.
   - Verification: `drizzle-kit generate` produces zero diff (proves the split is structural-only).

3. **Provider migrations** (one commit per provider — 14 commits)
   - For each provider in [`dataforseo`, `gsc`, `ga4`, `bing`, `wikipedia`, `clarity`, `cloudflare-radar`, `pagespeed`, `meta`, `brevo`, `openai`, `anthropic`, `perplexity`, `google-ai-studio`]:
     - Refactor `http.ts` to extend `BaseHttpClient`.
     - Delete `<X>ApiError`; throw `ProviderApiError` from the new HTTP base.
     - Write `manifest.ts` exporting `ProviderManifest`.
     - Migrate the existing `Provider` class to wrap the manifest (interim adapter; fully replaced in commit 6).
   - After each commit: existing tests pass, integration paths unchanged.

4. **Context module migrations** (one commit per bounded context — ~13 commits)
   - For each context in [`identity-access`, `project-management`, `rank-tracking`, `search-console-insights`, `traffic-analytics`, `web-performance`, `entity-awareness`, `bing-webmaster-insights`, `macro-context`, `experience-analytics`, `ai-search-insights`, `meta-ads-attribution`, `provider-connectivity`]:
     - Write `module.ts` exporting `ContextModule` with `compose(deps)`.
     - The existing composition-root still has the explicit wiring; the new module co-exists, untested by composition until commit 6.
     - Auto-schedule handlers still standalone files for now (deleted in commit 7).

5. **IngestRouter activation**
   - In the worker, build `IngestRouter` from manifests + ingest use cases.
   - Wire it into `ProviderFetchProcessor`.
   - Replace the 12 if-else dispatch blocks with `await this.deps.ingestRouter.dispatch(...)`.
   - Existing tests pass (worker integration paths now use the router).

6. **Composition-root + worker main rewrite**
   - Replace `apps/api/src/composition/composition-root.ts` body with the manifest+module iteration loop.
   - Replace `apps/worker/src/main.ts` with a SharedDeps + module-iteration version.
   - Delete the wiring blocks for: explicit repo constructions, explicit use-case constructions, explicit auto-schedule handler instantiations.
   - Tests pass (all 220+).

7. **Cleanup**
   - Delete the 10 standalone `auto-schedule-on-*.handler.ts` files (logic now in module configs).
   - Delete the deprecated `Provider` interface from `provider-core/types.ts` (replaced by `ProviderManifest`).
   - Delete unused DI tokens that the new resolution-by-key replaces.
   - Delete the `ProviderFetchProcessorDeps` fields that `IngestRouter` absorbed.

8. **`DrizzleRepository<T>` adoption** (best-effort — at least 5 repos)
   - Convert at least 5 simple repos (e.g. `DrizzleGscPropertyRepository`, `DrizzleBingPropertyRepository`, `DrizzleMonitoredDomainRepository`, `DrizzleClarityProjectRepository`, `DrizzleMetaPixelRepository`) to extend `DrizzleRepository<T>`.
   - Time-series / complex repos (e.g. `DrizzleRankingObservationRepository`) stay imperative; the base class is opt-in.

9. **Documentation**
   - Update `CLAUDE.md` § 7 ("Cómo añadir cosas") to describe the manifest/module pattern.
   - Add `docs/adr/0002-provider-extension-platform.md` capturing the decision.
   - Add `docs/recipes/adding-a-provider.md` walkthrough.

## Testing strategy

- **All 220+ existing tests stay green** through every commit. Each commit runs `pnpm typecheck && pnpm test`.
- **New unit tests** for each new abstraction:
  - `BaseHttpClient` — auth header application, timeout, error wrapping, JSON parse failure.
  - `ProviderApiError.isQuotaExhausted` — 429 + 402 cases.
  - `IngestRouter.dispatch` — happy path, missing-systemParam guard, raw-only endpoint, unknown key.
  - `buildIngestRouter` — registration, missing-use-case error.
  - `buildAutoScheduleHandlers` — single schedule, multi schedule, dynamic fan-out, swallow-errors semantic.
  - `DrizzleRepository.findById` — at least one integration test against real Postgres (sets up the Testcontainers harness as a side benefit; addresses the gap from PR #86's "Task 8.1 deferred" follow-up).
- **Provider migration tests**: each provider's existing http.ts unit tests are migrated to the new manifest's `fetch` function. No new tests required.
- **Integration tests**: at least one end-to-end (`link entity → schedule created → run-now → row in hypertable`) per refactored context. Closes PR #86's Task 8.1 follow-up.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Long-lived branch (~3 weeks) | Weekly rebase on main; ordered commits keep branch always-buildable; subagent review per commit |
| Schema split spurious migrations | `drizzle-kit generate` verification after step 2 must produce zero diff |
| composition-root rewrite has highest impact area | Step 6 is LAST; preceded by 5 steps of validated foundation; `apps/api` + `apps/worker` integration tests added in step 1 |
| `Provider` interface deletion breaks consumers | `ProviderRegistry` adapted in step 1 to accept manifests; `Provider` interface stays as deprecated alias until step 7 |
| 14 provider migrations × 14 commits = friction | Each provider migration follows the same template; subagent-driven-development dispatches one per task |
| Test gaps in worker (no harness today) | Step 1 includes adding a `_test-harness.ts` for the worker that's reused across new tests |

## What doesn't change

- Domain layer (entities, value objects, events, ports).
- Public API contracts (Zod DTOs, OpenAPI shape, controller routes).
- Database schema (only file organization changes; drizzle-kit verifies zero migration diff).
- The `ScheduleEndpointFetchUseCase` semantics, `idempotencyKey` shape, controller gate semantics.
- The 13 entity-bound endpoints' behaviour (auto-scheduled the same way).

## Acceptance criteria

- [ ] `BaseHttpClient` + `ProviderApiError` exist in `provider-core`. All 14 providers extend the base. All 14 `<X>ApiError` classes deleted.
- [ ] `ProviderManifest` and `ContextModule` types exist; their docstrings reference this design.
- [ ] All 14 providers export a `ProviderManifest` from their package's `index.ts`.
- [ ] All 13 bounded contexts export a `ContextModule` from their application package.
- [ ] `composition-root.ts` is < 200 LOC and iterates `manifests` + `modules`.
- [ ] `apps/worker/src/main.ts` < 150 LOC; uses the same `SharedDeps` factory.
- [ ] `provider-fetch.processor.ts` < 300 LOC; the 12 if-else dispatch blocks are gone.
- [ ] The 10 `auto-schedule-on-*.handler.ts` files are gone; their logic lives in `ContextModule.compose()` configs.
- [ ] `schema/index.ts` < 30 LOC barrel; per-context schema files exist.
- [ ] `DrizzleRepository<T>` base class exists; at least 5 repos use it.
- [ ] All 220+ existing tests pass. New tests cover the new abstractions and at least 3 integration scenarios.
- [ ] `CLAUDE.md` § 7 updated. ADR 0002 committed. `docs/recipes/adding-a-provider.md` exists.
- [ ] Adding a hypothetical "Provider X" is verifiably reduced to: 1 new package with a manifest + 1 entry in `manifests.ts`. (Demonstrated in the recipe.)

## Out of scope (separate issues)

- **Tema C** — OpenAPI auto-derivation from Zod via `@asteasolutions/zod-to-openapi` + SDK auto-generation.
- **Tema D** — Outbox pattern for cross-process events (replace `InMemoryEventPublisher`).
- **Tema E** — Frontend `<ResourcePage>` + `<FormDrawer>` templates + `queryKeys.ts` factory + i18n cleanup. Coordinates with PR #84 draft.
- **Worker test harness expansion** — beyond the minimum `_test-harness.ts` introduced here.
- **Per-provider quota override hook** — `ProviderManifest.isQuotaExhausted?: (err) => boolean` is included in the design but only used if a provider needs it; no provider has the requirement today (all use 429 + 402).

## References

- ADR 0001 — Eliminate SystemParamResolver via auto-schedule handlers (closed by PRs #86 + #90).
- Audit reports (2026-05-06) — Domain/Application, Infrastructure/Providers, Orchestration, API/Contracts, Web, DX.
- Issue #56 (closed) — original architectural concern that triggered ADR 0001 and surfaced the manifest opportunity.
