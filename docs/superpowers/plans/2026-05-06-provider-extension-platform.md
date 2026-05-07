# Provider Extension Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current per-provider scattered wiring with a declarative `ProviderManifest` + `ContextModule` architecture so adding a new provider/context drops to "1 manifest export + 1 line in the registry array". Closes [issue #93](https://github.com/vgpastor/93).

**Architecture:** Two-axis manifest pattern. `ProviderManifest` (pure data) lives in each provider package; `ContextModule` (factory function) lives in each application package. The composition root iterates `manifests` + `modules` lists, builds a `ProviderRegistry`, an `IngestRouter`, and event-bus subscriptions. No per-provider/per-context wiring code remains in `composition-root.ts` or `apps/worker/src/main.ts`. See [ADR 0002](../../adr/0002-provider-extension-platform.md) for the decision rationale and [the design doc](../specs/2026-05-06-provider-extension-platform-design.md) for the full design.

**Tech Stack:** TypeScript 5.x strict, NestJS 11, Drizzle ORM, BullMQ, Vitest, Testcontainers, Postgres+TimescaleDB, pino. ESM modules with `.js` extensions in imports.

**Estimated scope:** ~150 file changes (~80 modified, ~40 created, ~30 deleted), ~3 weeks single PR with ordered commits keeping main green throughout.

**Reference docs (read first):**
- [`docs/adr/0002-provider-extension-platform.md`](../../adr/0002-provider-extension-platform.md) — decision.
- [`docs/superpowers/specs/2026-05-06-provider-extension-platform-design.md`](../specs/2026-05-06-provider-extension-platform-design.md) — full design.
- [`CLAUDE.md`](../../../CLAUDE.md) — repo conventions.

---

## File structure overview

### CREATE (~40 files)

| Path | Responsibility |
|---|---|
| `packages/providers/core/src/manifest.ts` | `ProviderManifest`, `EndpointManifest`, `IngestBinding`, `AclContext`, `HttpConfig`, `AuthStrategy` types |
| `packages/providers/core/src/error.ts` | `ProviderApiError` class + `isQuotaExhaustedError` helper |
| `packages/providers/core/src/http-base.ts` | `BaseHttpClient` abstract class |
| `packages/providers/core/src/http-base.spec.ts` | unit tests for `BaseHttpClient` |
| `packages/application/core/` | NEW PACKAGE |
| `packages/application/core/package.json` | npm metadata |
| `packages/application/core/tsconfig.json` | tsconfig |
| `packages/application/core/src/index.ts` | barrel |
| `packages/application/core/src/module.ts` | `ContextModule`, `ContextRegistrations`, `IngestUseCase`, `EventHandler` types |
| `packages/application/core/src/auto-schedule.ts` | `buildAutoScheduleHandlers`, `AutoScheduleConfig`, `AutoScheduleSpec` |
| `packages/application/core/src/auto-schedule.spec.ts` | unit tests |
| `apps/worker/src/processors/ingest-router.ts` | `IngestRouter` class + `buildIngestRouter` factory |
| `apps/worker/src/processors/ingest-router.spec.ts` | unit tests |
| `apps/api/src/composition/shared-deps.ts` | `buildSharedDeps(env)` factory |
| `apps/api/src/composition/manifests.ts` | exports `providerManifests: ProviderManifest[]` |
| `apps/api/src/composition/modules.ts` | exports `contextModules: ContextModule[]` |
| `packages/infrastructure/src/persistence/drizzle/repositories/_base.ts` | `DrizzleRepository<TAggregate, TRow>` |
| `packages/infrastructure/src/persistence/drizzle/schema/<13 files>.ts` | per-context schema fragments |
| `packages/providers/<14>/src/manifest.ts` | one `ProviderManifest` per provider |
| `packages/application/<13>/src/module.ts` | one `ContextModule` per bounded context |
| `docs/recipes/adding-a-provider.md` | walkthrough |

### MODIFY (~80 files)

| Path | What changes |
|---|---|
| `packages/providers/core/src/types.ts` | mark `Provider` interface as deprecated; keep until Phase 7 |
| `packages/providers/core/src/registry.ts` | accept both `Provider` AND `ProviderManifest`; new `register(manifest)` overload |
| `packages/providers/core/src/index.ts` | export new types |
| `packages/providers/<14>/src/http.ts` | extend `BaseHttpClient`; delete inline `<X>ApiError` |
| `packages/providers/<14>/src/index.ts` | export `manifest` |
| `packages/application/<13>/src/index.ts` | export `module` |
| `apps/api/src/composition/composition-root.ts` | drops from 793 LOC to ~150 |
| `apps/api/src/composition/tokens.ts` | delete tokens replaced by ingest-key resolution |
| `apps/worker/src/main.ts` | drops from 290 LOC to ~150 |
| `apps/worker/src/processors/provider-fetch.processor.ts` | drops from 818 LOC to ~250 (12 if-else blocks gone) |
| `apps/worker/src/providers/registry.ts` | replace with manifest-based |
| `packages/infrastructure/src/persistence/drizzle/schema/index.ts` | becomes ~30-LOC barrel |
| `CLAUDE.md` | § 7 ("Cómo añadir cosas") rewritten |

### DELETE (~30 files)

- 14× `packages/providers/<x>/src/error.ts` or inline `<X>ApiError` classes (replaced by `ProviderApiError`).
- 10× `packages/application/<x>/src/event-handlers/auto-schedule-on-*.handler.ts` (replaced by configs in `module.ts`).
- 10× their `.spec.ts` files.

---

## Phase 1 — Foundation classes (no consumers yet)

Each task in this phase adds a new file/abstraction that no production code uses yet. Tests cover the new code in isolation. After Phase 1 ends, the repo compiles and all existing tests pass; new abstractions are unused.

### Task 1.1: ProviderApiError + isQuotaExhaustedError

**Files:**
- Create: `packages/providers/core/src/error.ts`
- Create: `packages/providers/core/src/error.spec.ts`
- Modify: `packages/providers/core/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/providers/core/src/error.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ProviderApiError, isQuotaExhaustedError } from './error.js';

describe('ProviderApiError', () => {
	it('captures providerId, status, body, message', () => {
		const err = new ProviderApiError('meta', 429, '{"error":"rate"}', 'rate limited');
		expect(err.providerId).toBe('meta');
		expect(err.status).toBe(429);
		expect(err.body).toBe('{"error":"rate"}');
		expect(err.message).toBe('rate limited');
		expect(err.code).toBe('PROVIDER_API_ERROR');
		expect(err.name).toBe('ProviderApiError');
	});

	it('extends Error and is instanceof', () => {
		const err = new ProviderApiError('gsc', 500, undefined, 'boom');
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ProviderApiError);
	});

	it('body can be undefined (for network/timeout errors)', () => {
		const err = new ProviderApiError('bing', 0, undefined, 'timeout');
		expect(err.body).toBeUndefined();
	});
});

describe('isQuotaExhaustedError', () => {
	it('returns true for status 429', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 429, '', 'rate'))).toBe(true);
	});

	it('returns true for status 402', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 402, '', 'over quota'))).toBe(true);
	});

	it('returns false for other 4xx', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 401, '', 'unauthorized'))).toBe(false);
		expect(isQuotaExhaustedError(new ProviderApiError('any', 404, '', 'not found'))).toBe(false);
	});

	it('returns false for 5xx', () => {
		expect(isQuotaExhaustedError(new ProviderApiError('any', 500, '', 'boom'))).toBe(false);
	});

	it('returns false for non-ProviderApiError', () => {
		expect(isQuotaExhaustedError(new Error('plain'))).toBe(false);
		expect(isQuotaExhaustedError({ status: 429 })).toBe(false);
		expect(isQuotaExhaustedError(null)).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
pnpm --filter @rankpulse/provider-core test -- error.spec
```

Expected: FAIL with "Cannot find module './error.js'".

- [ ] **Step 3: Implement**

Create `packages/providers/core/src/error.ts`:

```ts
/**
 * Unified provider API error. Replaces the per-provider `<X>ApiError` classes
 * that proliferated as new providers were added (DataForSeoApiError,
 * BingApiError, OpenAiApiError, ClarityApiError, BrevoApiError, ...). The
 * `providerId` discriminant lets quota / retry logic do a single instanceof
 * check + status comparison instead of an N-way chain.
 *
 * `status === 0` is reserved for network / timeout / abort failures (no
 * upstream response).
 *
 * `body` is the upstream response body (truncated to ~4 KB by the HTTP
 * base) for diagnostics; may be undefined for network errors.
 */
export class ProviderApiError extends Error {
	readonly code = 'PROVIDER_API_ERROR' as const;

	constructor(
		readonly providerId: string,
		readonly status: number,
		readonly body: string | undefined,
		message: string,
	) {
		super(message);
		this.name = 'ProviderApiError';
	}
}

/**
 * Quota-exhausted = the upstream is telling us "no budget for now". Worker
 * auto-pauses the JobDefinition until the next billing window. Status 429
 * (rate limit) and 402 (payment required / over-quota) cover every provider
 * we integrate today; if a future provider needs a different status, expose
 * a per-manifest override hook (see ProviderManifest design doc).
 */
export function isQuotaExhaustedError(err: unknown): boolean {
	return err instanceof ProviderApiError && (err.status === 429 || err.status === 402);
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @rankpulse/provider-core test -- error.spec
```

Expected: PASS.

- [ ] **Step 5: Update barrel**

Modify `packages/providers/core/src/index.ts`. Add:

```ts
export * from './error.js';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @rankpulse/provider-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/providers/core/src/error.ts \
        packages/providers/core/src/error.spec.ts \
        packages/providers/core/src/index.ts
git commit -m "feat(provider-core): ProviderApiError + isQuotaExhaustedError (foundation for ADR 0002)"
```

### Task 1.2: ProviderManifest types

**Files:**
- Create: `packages/providers/core/src/manifest.ts`
- Create: `packages/providers/core/src/manifest.spec.ts`
- Modify: `packages/providers/core/src/index.ts`

- [ ] **Step 1: Write the failing test (type-level)**

Create `packages/providers/core/src/manifest.spec.ts`:

```ts
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type {
	ProviderManifest,
	EndpointManifest,
	IngestBinding,
	AclContext,
	HttpConfig,
	AuthStrategy,
} from './manifest.js';

describe('ProviderManifest types', () => {
	it('compiles a minimal manifest', () => {
		const sampleSchema = z.object({ url: z.string() });
		type SampleParams = z.infer<typeof sampleSchema>;
		interface SampleResponse { ok: true }

		const manifest: ProviderManifest = {
			id: 'sample',
			displayName: 'Sample Provider',
			http: { baseUrl: 'https://api.example.com', auth: { kind: 'bearer-token' } },
			validateCredentialPlaintext: () => {},
			endpoints: [
				{
					descriptor: {
						id: 'sample-endpoint',
						category: 'rankings',
						displayName: 'Sample',
						description: 'desc',
						paramsSchema: sampleSchema,
						cost: { unit: 'usd_cents', amount: 0 },
						defaultCron: '0 5 * * *',
						rateLimit: { max: 60, durationMs: 60_000 },
					},
					fetch: async () => ({ ok: true } satisfies SampleResponse),
					ingest: null,
				} satisfies EndpointManifest<SampleParams, SampleResponse>,
			],
		};
		expect(manifest.id).toBe('sample');
	});

	it('endpoint with ingest binding compiles', () => {
		const ingest: IngestBinding<{ rows: unknown[] }> = {
			useCaseKey: 'sample:ingest',
			systemParamKey: 'sampleEntityId',
			acl: (response, ctx: AclContext) => response.rows,
		};
		expect(ingest.useCaseKey).toBe('sample:ingest');
	});

	it('AuthStrategy discriminated union covers expected kinds', () => {
		const strategies: AuthStrategy[] = [
			{ kind: 'bearer-token' },
			{ kind: 'api-key-header', headerName: 'X-API-Key' },
			{ kind: 'basic' },
			{ kind: 'oauth-token' },
			{ kind: 'service-account-jwt' },
			{ kind: 'api-key-or-service-account-jwt' },
			{ kind: 'custom', sign: (req) => req },
		];
		expect(strategies).toHaveLength(7);
	});

	it('HttpConfig accepts optional timeoutMs and retries', () => {
		const config: HttpConfig = {
			baseUrl: 'https://api.example.com',
			auth: { kind: 'bearer-token' },
			defaultTimeoutMs: 30_000,
			defaultRetries: 3,
		};
		expect(config.defaultTimeoutMs).toBe(30_000);
	});
});
```

- [ ] **Step 2: Run test — confirm fail**

```bash
pnpm --filter @rankpulse/provider-core test -- manifest.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/providers/core/src/manifest.ts`:

```ts
import type { EndpointDescriptor, FetchContext } from './types.js';

/**
 * Pure-data declaration of a provider. Replaces the `Provider` interface
 * (deprecated; deleted in Phase 7). Lives in each provider package's
 * `manifest.ts` and is exported as a value (not a class) so iteration and
 * inspection are trivial.
 *
 * See ADR 0002 for the rationale of choosing data-driven manifests over
 * class-based provider implementations.
 */
export interface ProviderManifest {
	readonly id: string;
	readonly displayName: string;
	readonly http: HttpConfig;
	readonly endpoints: readonly EndpointManifest[];
	/**
	 * Per-provider credential format check, called by
	 * RegisterProviderCredentialUseCase before encrypting and persisting.
	 * Throws InvalidInputError on format mismatch. Returning normally means
	 * the format is acceptable; it does NOT prove the secret is authorised.
	 */
	validateCredentialPlaintext(plaintextSecret: string): void;
	/**
	 * Optional override for quota detection. Most providers signal quota
	 * exhaustion via 429 / 402 (the default in `isQuotaExhaustedError`). A
	 * provider that uses a different signal (e.g. 401 = "key revoked, must
	 * re-link") implements this hook. Returns true if the error should
	 * auto-pause the JobDefinition.
	 */
	readonly isQuotaExhausted?: (error: unknown) => boolean;
}

export interface HttpConfig {
	readonly baseUrl: string;
	readonly auth: AuthStrategy;
	readonly defaultTimeoutMs?: number;
	readonly defaultRetries?: number;
}

export type AuthStrategy =
	| { readonly kind: 'bearer-token' }
	| { readonly kind: 'api-key-header'; readonly headerName: string }
	| { readonly kind: 'basic' }
	| { readonly kind: 'oauth-token' }
	| { readonly kind: 'service-account-jwt' }
	| { readonly kind: 'api-key-or-service-account-jwt' }
	| { readonly kind: 'custom'; readonly sign: (req: HttpRequest, plaintextSecret: string) => HttpRequest };

export interface HttpRequest {
	readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	readonly url: string;
	readonly headers: Record<string, string>;
	readonly body?: unknown;
}

export interface EndpointManifest<TParams = unknown, TResponse = unknown> {
	readonly descriptor: EndpointDescriptor;
	readonly fetch: (http: HttpClient, params: TParams, ctx: FetchContext) => Promise<TResponse>;
	readonly ingest: IngestBinding<TResponse> | null;
}

export interface IngestBinding<TResponse = unknown> {
	readonly useCaseKey: string;
	readonly systemParamKey: string;
	readonly acl: (response: TResponse, ctx: AclContext) => unknown[];
}

export interface AclContext {
	readonly dateBucket: string;
	readonly systemParams: Record<string, unknown>;
	readonly endpointParams: Record<string, unknown>;
}

/**
 * Minimal HTTP client surface that EndpointManifest.fetch uses. Concrete
 * impl is BaseHttpClient (next task), which implements timeout, error
 * wrapping, JSON parsing, and auth-strategy header application.
 */
export interface HttpClient {
	get<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T>;
	post<T>(path: string, query: Record<string, string>, body: unknown, ctx: FetchContext): Promise<T>;
	put<T>(path: string, query: Record<string, string>, body: unknown, ctx: FetchContext): Promise<T>;
	delete<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T>;
}
```

- [ ] **Step 4: Run test — verify pass**

```bash
pnpm --filter @rankpulse/provider-core test -- manifest.spec
```

Expected: PASS.

- [ ] **Step 5: Update barrel**

Modify `packages/providers/core/src/index.ts`. Append:

```ts
export * from './manifest.js';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @rankpulse/provider-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/providers/core/src/manifest.ts \
        packages/providers/core/src/manifest.spec.ts \
        packages/providers/core/src/index.ts
git commit -m "feat(provider-core): ProviderManifest type system (ADR 0002)"
```

### Task 1.3: BaseHttpClient

**Files:**
- Create: `packages/providers/core/src/http-base.ts`
- Create: `packages/providers/core/src/http-base.spec.ts`
- Modify: `packages/providers/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/providers/core/src/http-base.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BaseHttpClient } from './http-base.js';
import { ProviderApiError } from './error.js';
import type { FetchContext } from './types.js';
import type { HttpConfig } from './manifest.js';

class TestClient extends BaseHttpClient {
	protected applyAuth(plaintextSecret: string): Record<string, string> {
		return { Authorization: `Bearer ${plaintextSecret}` };
	}
	protected buildUrl(path: string, query: Record<string, string>): string {
		const qs = new URLSearchParams(query).toString();
		return `${this.config.baseUrl}${path}${qs ? `?${qs}` : ''}`;
	}
}

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: 'secret' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-06T00:00:00Z'),
});

const config: HttpConfig = {
	baseUrl: 'https://api.example.com',
	auth: { kind: 'bearer-token' },
	defaultTimeoutMs: 5_000,
};

describe('BaseHttpClient', () => {
	it('GET applies auth, returns parsed JSON', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const client = new TestClient('test', config);
		const result = await client.get<{ ok: boolean }>('/endpoint', { q: '1' }, ctx());
		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://api.example.com/endpoint?q=1');
		expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer secret' });
		fetchMock.mockRestore();
	});

	it('non-2xx response throws ProviderApiError with status + body + providerId', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('upstream said no', { status: 429 }));
		const client = new TestClient('test', config);
		await expect(client.get('/endpoint', {}, ctx())).rejects.toMatchObject({
			name: 'ProviderApiError',
			providerId: 'test',
			status: 429,
			body: 'upstream said no',
		});
		fetchMock.mockRestore();
	});

	it('non-JSON 2xx body throws ProviderApiError', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }));
		const client = new TestClient('test', config);
		await expect(client.get('/endpoint', {}, ctx())).rejects.toBeInstanceOf(ProviderApiError);
		fetchMock.mockRestore();
	});

	it('network error throws ProviderApiError with status 0', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValue(new Error('ECONNREFUSED'));
		const client = new TestClient('test', config);
		await expect(client.get('/endpoint', {}, ctx())).rejects.toMatchObject({
			providerId: 'test',
			status: 0,
		});
		fetchMock.mockRestore();
	});

	it('caller AbortSignal aborts the request', async () => {
		const controller = new AbortController();
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation((_url, init) => {
				const signal = (init as RequestInit).signal as AbortSignal;
				return new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
				});
			});
		const client = new TestClient('test', config);
		const promise = client.get('/endpoint', {}, { ...ctx(), signal: controller.signal });
		controller.abort();
		await expect(promise).rejects.toBeInstanceOf(ProviderApiError);
		fetchMock.mockRestore();
	});
});
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
pnpm --filter @rankpulse/provider-core test -- http-base.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/providers/core/src/http-base.ts`:

```ts
import { ProviderApiError } from './error.js';
import type { HttpConfig, AuthStrategy, HttpClient } from './manifest.js';
import type { FetchContext } from './types.js';

const RESPONSE_BODY_MAX_BYTES = 4_096;

/**
 * Composes two AbortSignals so the request aborts when EITHER fires.
 * Caller-provided signal (job cancellation) + internal timeout signal.
 */
function composeSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
	const real = signals.filter((s): s is AbortSignal => Boolean(s));
	if (real.length === 1) return real[0]!;
	const controller = new AbortController();
	for (const s of real) {
		if (s.aborted) {
			controller.abort();
			return controller.signal;
		}
		s.addEventListener('abort', () => controller.abort(), { once: true });
	}
	return controller.signal;
}

/**
 * Shared HTTP base for all provider adapters. Handles:
 *  - Auth header application (via the AuthStrategy enum or subclass override).
 *  - Internal timeout + caller-signal composition.
 *  - Error wrapping into ProviderApiError (status 0 = network / timeout).
 *  - Response body capping (4 KB max in the error payload).
 *  - JSON parse fallback (raises ProviderApiError if body isn't JSON).
 *
 * Subclasses override `applyAuth` and `buildUrl` for provider-specific
 * concerns. The default `applyAuth` selects on AuthStrategy.kind for the
 * common cases (bearer, api-key-header, basic). Custom strategies provide
 * their own `sign(req, secret)` function or override the method.
 */
export abstract class BaseHttpClient implements HttpClient {
	constructor(
		protected readonly providerId: string,
		protected readonly config: HttpConfig,
	) {}

	get<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T> {
		return this.request<T>('GET', path, query, undefined, ctx);
	}

	post<T>(path: string, query: Record<string, string>, body: unknown, ctx: FetchContext): Promise<T> {
		return this.request<T>('POST', path, query, body, ctx);
	}

	put<T>(path: string, query: Record<string, string>, body: unknown, ctx: FetchContext): Promise<T> {
		return this.request<T>('PUT', path, query, body, ctx);
	}

	delete<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T> {
		return this.request<T>('DELETE', path, query, undefined, ctx);
	}

	protected async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		const url = this.buildUrl(path, query);
		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const headers = this.applyAuth(ctx.credential.plaintextSecret, body);
		const init: RequestInit = { method, signal, headers };
		if (body !== undefined && (method === 'POST' || method === 'PUT')) {
			init.body = JSON.stringify(body);
			(init.headers as Record<string, string>)['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await fetch(url, init);
		} catch (err) {
			const message =
				err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
					? 'request aborted or timed out'
					: `network error: ${err instanceof Error ? err.message : String(err)}`;
			throw new ProviderApiError(this.providerId, 0, undefined, message);
		}

		if (!response.ok) {
			const text = await this.safeText(response);
			throw new ProviderApiError(
				this.providerId,
				response.status,
				text,
				`${this.providerId} ${method} ${path} → ${response.status}`,
			);
		}

		return this.parseResponse<T>(response, method, path);
	}

	protected async parseResponse<T>(response: Response, method: string, path: string): Promise<T> {
		const text = await response.text();
		if (text.length === 0) return undefined as unknown as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProviderApiError(
				this.providerId,
				response.status,
				text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`${this.providerId} ${method} ${path} → ${response.status} non-JSON body`,
			);
		}
	}

	protected async safeText(response: Response): Promise<string> {
		try {
			const text = await response.text();
			return text.slice(0, RESPONSE_BODY_MAX_BYTES);
		} catch {
			return '';
		}
	}

	/**
	 * Default auth-header application based on the manifest's AuthStrategy.
	 * Subclasses may override for non-standard cases (e.g. DataForSEO basic
	 * with username:password split, GSC service-account JWT exchange).
	 */
	protected applyAuth(plaintextSecret: string, _body: unknown): Record<string, string> {
		const auth: AuthStrategy = this.config.auth;
		switch (auth.kind) {
			case 'bearer-token':
				return { Authorization: `Bearer ${plaintextSecret}` };
			case 'api-key-header':
				return { [auth.headerName]: plaintextSecret };
			case 'oauth-token':
				return { Authorization: `Bearer ${plaintextSecret}` };
			case 'basic': {
				// plaintextSecret format: "username:password"
				const b64 = Buffer.from(plaintextSecret).toString('base64');
				return { Authorization: `Basic ${b64}` };
			}
			case 'service-account-jwt':
			case 'api-key-or-service-account-jwt':
			case 'custom':
				throw new Error(
					`AuthStrategy '${auth.kind}' requires the provider to override applyAuth(). Did you forget?`,
				);
		}
	}

	/**
	 * Default URL builder. Subclasses with non-trivial URL construction
	 * (e.g. dynamic API versioning) override this.
	 */
	protected buildUrl(path: string, query: Record<string, string>): string {
		const qs = new URLSearchParams(query).toString();
		return `${this.config.baseUrl}${path}${qs ? `?${qs}` : ''}`;
	}
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @rankpulse/provider-core test -- http-base.spec
```

Expected: PASS.

- [ ] **Step 5: Update barrel**

Modify `packages/providers/core/src/index.ts`. Append:

```ts
export * from './http-base.js';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @rankpulse/provider-core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/providers/core/src/http-base.ts \
        packages/providers/core/src/http-base.spec.ts \
        packages/providers/core/src/index.ts
git commit -m "feat(provider-core): BaseHttpClient with auth/timeout/error wrapping (ADR 0002)"
```

### Task 1.4: Create `application/core` package

**Files:**
- Create: `packages/application/core/package.json`
- Create: `packages/application/core/tsconfig.json`
- Create: `packages/application/core/src/index.ts`
- Modify: `pnpm-workspace.yaml` (already covers `packages/application/*` — verify)

- [ ] **Step 1: Create package.json**

Create `packages/application/core/package.json`:

```json
{
	"name": "@rankpulse/application-core",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": "./dist/index.js"
	},
	"scripts": {
		"build": "tsc -p tsconfig.build.json",
		"typecheck": "tsc --noEmit",
		"test": "vitest run --passWithNoTests",
		"clean": "rm -rf dist .turbo *.tsbuildinfo"
	},
	"dependencies": {
		"@rankpulse/domain": "workspace:*",
		"@rankpulse/shared": "workspace:*"
	},
	"devDependencies": {
		"typescript": "6.0.3",
		"vitest": "4.1.5"
	}
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/application/core/tsconfig.json`:

```json
{
	"extends": "../../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "dist",
		"rootDir": "src"
	},
	"include": ["src/**/*"]
}
```

Create `packages/application/core/tsconfig.build.json`:

```json
{
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"noEmit": false,
		"declaration": true,
		"declarationMap": true,
		"sourceMap": true
	},
	"exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Create empty barrel**

Create `packages/application/core/src/index.ts`:

```ts
// Populated by Tasks 1.5 + 1.6
export {};
```

- [ ] **Step 4: Install + verify workspace recognition**

```bash
pnpm install
pnpm --filter @rankpulse/application-core typecheck
```

Expected: typecheck PASS (empty package).

- [ ] **Step 5: Commit**

```bash
git add packages/application/core/ pnpm-lock.yaml
git commit -m "chore(application-core): scaffold new package (ADR 0002 prep)"
```

### Task 1.5: ContextModule + IngestUseCase + EventHandler types

**Files:**
- Create: `packages/application/core/src/module.ts`
- Create: `packages/application/core/src/module.spec.ts`
- Modify: `packages/application/core/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/application/core/src/module.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ContextModule, ContextRegistrations, IngestUseCase, EventHandler, SharedDeps } from './module.js';

describe('ContextModule types', () => {
	it('compiles a minimal module', () => {
		const ingest: IngestUseCase = {
			execute: async () => {},
		};
		const handler: EventHandler = {
			events: ['SampleEvent'],
			handle: async () => {},
		};
		const module: ContextModule = {
			id: 'sample',
			compose: (_deps: SharedDeps): ContextRegistrations => ({
				useCases: { foo: {} },
				ingestUseCases: { 'sample:ingest': ingest },
				eventHandlers: [handler],
				schemaTables: [],
			}),
		};
		expect(module.id).toBe('sample');
	});

	it('compose returns an object with the required shape', () => {
		const fakeDeps = {} as SharedDeps;
		const module: ContextModule = {
			id: 'x',
			compose: () => ({
				useCases: {},
				ingestUseCases: {},
				eventHandlers: [],
				schemaTables: [],
			}),
		};
		const regs = module.compose(fakeDeps);
		expect(regs.useCases).toBeDefined();
		expect(regs.ingestUseCases).toBeDefined();
		expect(Array.isArray(regs.eventHandlers)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test — confirm fail**

```bash
pnpm --filter @rankpulse/application-core test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/application/core/src/module.ts`:

```ts
import type { SharedKernel } from '@rankpulse/domain';

/**
 * Bounded-context contribution to composition. Each context exports a
 * `ContextModule` from its application package's `module.ts`. The
 * composition root iterates all modules and wires their registrations.
 *
 * Why a factory function and not a static manifest: the compose step
 * builds repos from `deps.drizzle`, instantiates use cases with their
 * dependencies, and constructs auto-schedule handlers. None of that can
 * live in pure data without losing type safety on dependency wiring.
 *
 * See ADR 0002.
 */
export interface ContextModule {
	readonly id: string;
	compose(deps: SharedDeps): ContextRegistrations;
}

export interface ContextRegistrations {
	/**
	 * Use cases exposed under DI tokens for controllers + other consumers.
	 * The composition root reads this map and registers each entry under
	 * its corresponding token. Keys MUST match the token's symbol description.
	 */
	readonly useCases: Record<string, unknown>;
	/**
	 * Subset of use cases that ProviderManifest's IngestBinding looks up.
	 * Keys match `IngestBinding.useCaseKey` (e.g. 'meta:pixel-events-ingest').
	 */
	readonly ingestUseCases: Record<string, IngestUseCase>;
	/** Auto-schedule handlers + future domain-event subscribers. */
	readonly eventHandlers: readonly EventHandler[];
	/**
	 * Drizzle table definitions owned by this context. Collected during
	 * Phase 2 (schema split). Informational today; future use for
	 * per-context test schema bootstrapping or partial migrations.
	 */
	readonly schemaTables: readonly unknown[];
}

export interface IngestUseCase {
	execute(input: {
		rawPayloadId: string;
		rows: unknown[];
		systemParams: Record<string, unknown>;
	}): Promise<void>;
}

export interface EventHandler {
	readonly events: readonly string[];
	handle(event: SharedKernel.DomainEvent): Promise<void>;
}

/**
 * Shape of the dependencies composition injects into every ContextModule.
 * The actual SharedDeps interface lives in `apps/api/src/composition/shared-deps.ts`
 * (it depends on infrastructure types we can't import here without a circular
 * dependency). This type alias is opaque to keep modules layer-pure.
 */
export interface SharedDeps {
	readonly _brand: 'SharedDeps';
	readonly [key: string]: unknown;
}
```

- [ ] **Step 4: Run test — verify pass**

```bash
pnpm --filter @rankpulse/application-core test
```

Expected: PASS.

- [ ] **Step 5: Update barrel**

Modify `packages/application/core/src/index.ts`:

```ts
export * from './module.js';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @rankpulse/application-core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/application/core/src/module.ts \
        packages/application/core/src/module.spec.ts \
        packages/application/core/src/index.ts
git commit -m "feat(application-core): ContextModule type system (ADR 0002)"
```

### Task 1.6: buildAutoScheduleHandlers + AutoScheduleConfig

**Files:**
- Create: `packages/application/core/src/auto-schedule.ts`
- Create: `packages/application/core/src/auto-schedule.spec.ts`
- Modify: `packages/application/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/application/core/src/auto-schedule.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SharedKernel } from '@rankpulse/domain';
import { buildAutoScheduleHandlers, type AutoScheduleConfig } from './auto-schedule.js';
import type { SharedDeps } from './module.js';

interface FakeEvent extends SharedKernel.DomainEvent {
	readonly type: 'FakeEntityLinked';
	readonly entityId: string;
	readonly projectId: string;
	readonly organizationId: string;
}

const fakeEvent = (overrides: Partial<FakeEvent> = {}): FakeEvent => ({
	type: 'FakeEntityLinked',
	entityId: 'fake-id',
	projectId: 'project-1',
	organizationId: 'org-1',
	occurredAt: new Date(),
	...overrides,
});

const buildDeps = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const logger = {
		child: () => logger,
		info: vi.fn(),
		error: vi.fn(),
	};
	const deps = {
		scheduleEndpointFetch: { execute },
		logger,
		_brand: 'SharedDeps' as const,
	} as unknown as SharedDeps;
	return { deps, execute, logger };
};

describe('buildAutoScheduleHandlers', () => {
	it('returns one EventHandler per config entry', () => {
		const { deps } = buildDeps();
		const configs: AutoScheduleConfig[] = [
			{
				event: 'FakeEntityLinked',
				schedule: {
					providerId: 'fake',
					endpointId: 'fake-endpoint',
					cron: '0 5 * * *',
					systemParamKey: 'entityId',
					paramsBuilder: (e) => ({ q: (e as FakeEvent).entityId }),
					systemParamsBuilder: (e) => ({
						organizationId: (e as FakeEvent).organizationId,
						entityId: (e as FakeEvent).entityId,
					}),
				},
			},
		];
		const handlers = buildAutoScheduleHandlers(deps, configs);
		expect(handlers).toHaveLength(1);
		expect(handlers[0]!.events).toEqual(['FakeEntityLinked']);
	});

	it('handler ignores events of other types', async () => {
		const { deps, execute } = buildDeps();
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				schedule: {
					providerId: 'fake',
					endpointId: 'fake-endpoint',
					cron: '0 5 * * *',
					systemParamKey: 'entityId',
					paramsBuilder: () => ({}),
					systemParamsBuilder: () => ({ entityId: 'x' }),
				},
			},
		]);
		await handlers[0]!.handle({
			type: 'OtherEvent',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('single-schedule case dispatches once with idempotencyKey', async () => {
		const { deps, execute } = buildDeps();
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				schedule: {
					providerId: 'fake',
					endpointId: 'fake-endpoint',
					cron: '0 5 * * *',
					systemParamKey: 'entityId',
					paramsBuilder: (e) => ({ q: (e as FakeEvent).entityId }),
					systemParamsBuilder: (e) => ({
						organizationId: (e as FakeEvent).organizationId,
						entityId: (e as FakeEvent).entityId,
					}),
				},
			},
		]);
		await handlers[0]!.handle(fakeEvent());
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith({
			projectId: 'project-1',
			providerId: 'fake',
			endpointId: 'fake-endpoint',
			params: { q: 'fake-id' },
			systemParams: { organizationId: 'org-1', entityId: 'fake-id' },
			cron: '0 5 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'entityId', systemParamValue: 'fake-id' },
		});
	});

	it('multi-schedule case fans out and Promise.all-isolates failures', async () => {
		const { deps, execute, logger } = buildDeps();
		execute.mockReset();
		execute.mockRejectedValueOnce(new Error('s1 down'));
		execute.mockResolvedValueOnce({ definitionId: 'def-s2' });
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				schedules: [
					{
						providerId: 'fake',
						endpointId: 'endpoint-1',
						cron: '0 5 * * *',
						systemParamKey: 'entityId',
						paramsBuilder: () => ({}),
						systemParamsBuilder: (e) => ({ entityId: (e as FakeEvent).entityId }),
					},
					{
						providerId: 'fake',
						endpointId: 'endpoint-2',
						cron: '0 5 * * *',
						systemParamKey: 'entityId',
						paramsBuilder: () => ({}),
						systemParamsBuilder: (e) => ({ entityId: (e as FakeEvent).entityId }),
					},
				],
			},
		]);
		await handlers[0]!.handle(fakeEvent());
		expect(execute).toHaveBeenCalledTimes(2);
		expect(logger.error).toHaveBeenCalledOnce();
	});

	it('dynamicSchedules resolves the schedule list at handle-time', async () => {
		const { deps, execute } = buildDeps();
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				dynamicSchedules: async () => [
					{
						providerId: 'fake',
						endpointId: 'd-endpoint',
						cron: '0 5 * * *',
						systemParamKey: 'entityId',
						paramsBuilder: () => ({}),
						systemParamsBuilder: (e) => ({ entityId: (e as FakeEvent).entityId }),
					},
				],
			},
		]);
		await handlers[0]!.handle(fakeEvent());
		expect(execute).toHaveBeenCalledOnce();
	});
});
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
pnpm --filter @rankpulse/application-core test -- auto-schedule.spec
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/application/core/src/auto-schedule.ts`:

```ts
import type { SharedKernel } from '@rankpulse/domain';
import type { EventHandler, SharedDeps } from './module.js';

/**
 * Configures one auto-schedule handler. Each config produces one
 * EventHandler. Three fan-out modes are supported:
 *
 *   - `schedule`: single schedule (most common — GSC, Ga4, Wikipedia, ...).
 *   - `schedules`: static list of schedules per event (Meta ad account
 *     fans into ads-insights + custom-audiences).
 *   - `dynamicSchedules`: schedule list computed from the event + deps
 *     (AI Brand Radar fans 4 providers × N project locales — depends on
 *     reading the project's locations from the repo).
 *
 * Exactly one of the three MUST be set; runtime validation throws if
 * none or more than one is provided.
 */
export interface AutoScheduleConfig {
	readonly event: string;
	readonly schedule?: AutoScheduleSpec;
	readonly schedules?: readonly AutoScheduleSpec[];
	readonly dynamicSchedules?: (
		event: SharedKernel.DomainEvent,
		deps: SharedDeps,
	) => Promise<readonly AutoScheduleSpec[]>;
}

export interface AutoScheduleSpec {
	readonly providerId: string;
	readonly endpointId: string;
	readonly cron: string;
	readonly systemParamKey: string;
	readonly paramsBuilder: (event: SharedKernel.DomainEvent) => Record<string, unknown>;
	readonly systemParamsBuilder: (event: SharedKernel.DomainEvent) => Record<string, unknown>;
}

interface ScheduleEndpointFetchResult {
	readonly definitionId: string;
}

interface ScheduleEndpointFetchExecutor {
	execute(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
		systemParams: Record<string, unknown>;
		cron: string;
		credentialOverrideId: null;
		idempotencyKey: { systemParamKey: string; systemParamValue: string };
	}): Promise<ScheduleEndpointFetchResult>;
}

interface ChildLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

interface RootLogger extends ChildLogger {
	child(bindings: object): ChildLogger;
}

interface AutoScheduleDeps extends SharedDeps {
	readonly scheduleEndpointFetch: ScheduleEndpointFetchExecutor;
	readonly logger: RootLogger;
}

export function buildAutoScheduleHandlers(
	deps: SharedDeps,
	configs: readonly AutoScheduleConfig[],
): EventHandler[] {
	const adeps = deps as AutoScheduleDeps;
	return configs.map((config) => buildOne(adeps, config));
}

function buildOne(deps: AutoScheduleDeps, config: AutoScheduleConfig): EventHandler {
	const modes = [config.schedule, config.schedules, config.dynamicSchedules].filter((x) => x !== undefined);
	if (modes.length !== 1) {
		throw new Error(
			`AutoScheduleConfig for event '${config.event}' must specify exactly one of {schedule, schedules, dynamicSchedules}; got ${modes.length}`,
		);
	}

	const log = deps.logger.child({ subsystem: 'auto-schedule', event: config.event });

	return {
		events: [config.event] as const,
		async handle(event: SharedKernel.DomainEvent): Promise<void> {
			if (event.type !== config.event) return;

			const specs: readonly AutoScheduleSpec[] = config.schedule
				? [config.schedule]
				: config.schedules
					? config.schedules
					: await config.dynamicSchedules!(event, deps);

			await Promise.all(
				specs.map(async (spec) => {
					const params = spec.paramsBuilder(event);
					const systemParams = spec.systemParamsBuilder(event);
					const idempotencyValue = systemParams[spec.systemParamKey];
					if (typeof idempotencyValue !== 'string') {
						log.error(
							{ spec: { providerId: spec.providerId, endpointId: spec.endpointId } },
							'systemParamsBuilder did not produce a string value for systemParamKey; skipping schedule',
						);
						return;
					}
					try {
						const result = await deps.scheduleEndpointFetch.execute({
							projectId: (event as { projectId: string }).projectId,
							providerId: spec.providerId,
							endpointId: spec.endpointId,
							params,
							systemParams,
							cron: spec.cron,
							credentialOverrideId: null,
							idempotencyKey: { systemParamKey: spec.systemParamKey, systemParamValue: idempotencyValue },
						});
						log.info(
							{ providerId: spec.providerId, endpointId: spec.endpointId, definitionId: result.definitionId },
							'auto-scheduled fetch on link',
						);
					} catch (err) {
						log.error(
							{
								providerId: spec.providerId,
								endpointId: spec.endpointId,
								err: err instanceof Error ? err.message : String(err),
							},
							'auto-schedule failed — operator must schedule manually',
						);
					}
				}),
			);
		},
	};
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @rankpulse/application-core test -- auto-schedule.spec
```

- [ ] **Step 5: Update barrel**

Modify `packages/application/core/src/index.ts`. Append:

```ts
export * from './auto-schedule.js';
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @rankpulse/application-core typecheck
git add packages/application/core/src/auto-schedule.ts \
        packages/application/core/src/auto-schedule.spec.ts \
        packages/application/core/src/index.ts
git commit -m "feat(application-core): buildAutoScheduleHandlers (ADR 0002)"
```

### Task 1.7: IngestRouter

**Files:**
- Create: `apps/worker/src/processors/ingest-router.ts`
- Create: `apps/worker/src/processors/ingest-router.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/worker/src/processors/ingest-router.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@rankpulse/shared';
import type { ProviderManifest, IngestBinding } from '@rankpulse/provider-core';
import type { IngestUseCase } from '@rankpulse/application-core';
import { IngestRouter, buildIngestRouter } from './ingest-router.js';

const buildEntry = (overrides: Partial<{ acl: () => unknown[]; execute: () => Promise<void> }> = {}) => {
	const acl = overrides.acl ?? vi.fn().mockReturnValue([{ row: 1 }]);
	const execute = overrides.execute ?? vi.fn().mockResolvedValue(undefined);
	const ingest: IngestUseCase = { execute };
	return { acl, execute, ingest };
};

describe('IngestRouter.dispatch', () => {
	it('happy path: looks up entry, runs ACL, calls ingest with rows + systemParams', async () => {
		const { acl, execute, ingest } = buildEntry();
		const entries = new Map([['fake|fake-endpoint', { systemParamKey: 'fakeId', acl, ingest }]]);
		const router = new IngestRouter(entries);

		await router.dispatch({
			providerId: 'fake',
			endpointId: 'fake-endpoint',
			fetchResult: { ok: true },
			rawPayloadId: 'rp-1',
			definition: { params: { fakeId: 'entity-1', siteUrl: 'x' } } as never,
			dateBucket: '2026-05-06',
		});

		expect(acl).toHaveBeenCalledWith(
			{ ok: true },
			expect.objectContaining({
				dateBucket: '2026-05-06',
				systemParams: { fakeId: 'entity-1', siteUrl: 'x' },
			}),
		);
		expect(execute).toHaveBeenCalledWith({
			rawPayloadId: 'rp-1',
			rows: [{ row: 1 }],
			systemParams: { fakeId: 'entity-1', siteUrl: 'x' },
		});
	});

	it('returns silently when (provider, endpoint) is not registered (raw-only)', async () => {
		const router = new IngestRouter(new Map());
		await expect(
			router.dispatch({
				providerId: 'unknown',
				endpointId: 'unknown',
				fetchResult: {},
				rawPayloadId: 'rp-1',
				definition: { params: {} } as never,
				dateBucket: '2026-05-06',
			}),
		).resolves.toBeUndefined();
	});

	it('throws NotFoundError when systemParam is missing', async () => {
		const { acl, ingest } = buildEntry();
		const entries = new Map([['fake|fake-endpoint', { systemParamKey: 'fakeId', acl, ingest }]]);
		const router = new IngestRouter(entries);

		await expect(
			router.dispatch({
				providerId: 'fake',
				endpointId: 'fake-endpoint',
				fetchResult: {},
				rawPayloadId: 'rp-1',
				definition: { params: {} } as never,
				dateBucket: '2026-05-06',
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('buildIngestRouter', () => {
	it('builds entries from manifest endpoints with ingest bindings', () => {
		const aclA = vi.fn();
		const aclB = vi.fn();
		const ingestA: IngestUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
		const ingestB: IngestUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
		const manifests: ProviderManifest[] = [
			{
				id: 'p1',
				displayName: 'P1',
				http: { baseUrl: 'http://x', auth: { kind: 'bearer-token' } },
				validateCredentialPlaintext: () => {},
				endpoints: [
					{
						descriptor: { id: 'e-a' } as never,
						fetch: async () => ({}),
						ingest: { useCaseKey: 'p1:a', systemParamKey: 'aId', acl: aclA },
					},
					{
						descriptor: { id: 'e-b' } as never,
						fetch: async () => ({}),
						ingest: { useCaseKey: 'p1:b', systemParamKey: 'bId', acl: aclB },
					},
					{
						descriptor: { id: 'e-c' } as never,
						fetch: async () => ({}),
						ingest: null, // raw-only
					},
				],
			},
		];
		const router = buildIngestRouter(manifests, { 'p1:a': ingestA, 'p1:b': ingestB });
		expect(router).toBeInstanceOf(IngestRouter);
	});

	it('throws when an IngestBinding references a useCaseKey not in the registrations', () => {
		const manifests: ProviderManifest[] = [
			{
				id: 'p1',
				displayName: 'P1',
				http: { baseUrl: 'http://x', auth: { kind: 'bearer-token' } },
				validateCredentialPlaintext: () => {},
				endpoints: [
					{
						descriptor: { id: 'e-x' } as never,
						fetch: async () => ({}),
						ingest: {
							useCaseKey: 'p1:missing',
							systemParamKey: 'eId',
							acl: () => [],
						} satisfies IngestBinding,
					},
				],
			},
		];
		expect(() => buildIngestRouter(manifests, {})).toThrow(/no IngestUseCase registered for key 'p1:missing'/);
	});
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
pnpm --filter @rankpulse/worker test -- ingest-router.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/worker/src/processors/ingest-router.ts`:

```ts
import type { ProviderManifest, AclContext } from '@rankpulse/provider-core';
import type { IngestUseCase } from '@rankpulse/application-core';
import type { ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

type ProviderEndpointKey = `${string}|${string}`;

export interface IngestRouterEntry {
	readonly systemParamKey: string;
	readonly acl: (response: unknown, ctx: AclContext) => unknown[];
	readonly ingest: IngestUseCase;
}

export interface IngestRouterDispatchInput {
	readonly providerId: string;
	readonly endpointId: string;
	readonly fetchResult: unknown;
	readonly rawPayloadId: string;
	readonly definition: ProviderConnectivity.ProviderJobDefinition;
	readonly dateBucket: string;
}

/**
 * Routes provider fetch results to the correct ingest use case based on
 * the (providerId, endpointId) tuple. Replaces the 12 if-else dispatch
 * blocks in the old provider-fetch.processor.ts.
 *
 * Built once at composition time from `ProviderManifest.endpoints[].ingest`
 * + the merged `ContextRegistrations.ingestUseCases` map. Endpoints with
 * `ingest: null` are raw-only — `dispatch()` returns silently for those;
 * the caller has already persisted the raw payload.
 */
export class IngestRouter {
	constructor(private readonly entries: ReadonlyMap<ProviderEndpointKey, IngestRouterEntry>) {}

	async dispatch(input: IngestRouterDispatchInput): Promise<void> {
		const key: ProviderEndpointKey = `${input.providerId}|${input.endpointId}`;
		const entry = this.entries.get(key);
		if (!entry) return;

		const params = input.definition.params as Record<string, unknown>;
		const systemParamValue = params[entry.systemParamKey];
		if (!systemParamValue) {
			throw new NotFoundError(
				`${input.providerId}/${input.endpointId} processor reached without ${entry.systemParamKey} in systemParams. ` +
					`Auto-Schedule handler should have set this. See ADR 0001.`,
			);
		}

		const rows = entry.acl(input.fetchResult, {
			dateBucket: input.dateBucket,
			systemParams: params,
			endpointParams: params,
		});

		await entry.ingest.execute({
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
			if (!endpoint.ingest) continue;
			const useCase = ingestUseCases[endpoint.ingest.useCaseKey];
			if (!useCase) {
				throw new Error(
					`IngestRouter: no IngestUseCase registered for key '${endpoint.ingest.useCaseKey}' (provider ${manifest.id}, endpoint ${endpoint.descriptor.id})`,
				);
			}
			const key: ProviderEndpointKey = `${manifest.id}|${endpoint.descriptor.id}`;
			entries.set(key, {
				systemParamKey: endpoint.ingest.systemParamKey,
				acl: endpoint.ingest.acl as (response: unknown, ctx: AclContext) => unknown[],
				ingest: useCase,
			});
		}
	}
	return new IngestRouter(entries);
}
```

- [ ] **Step 4: Add `@rankpulse/application-core` to worker deps**

In `apps/worker/package.json`, under `dependencies`:

```json
"@rankpulse/application-core": "workspace:*",
```

Then `pnpm install`.

- [ ] **Step 5: Run tests — verify pass**

```bash
pnpm --filter @rankpulse/worker test -- ingest-router.spec
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @rankpulse/worker typecheck
git add apps/worker/src/processors/ingest-router.ts \
        apps/worker/src/processors/ingest-router.spec.ts \
        apps/worker/package.json pnpm-lock.yaml
git commit -m "feat(worker): IngestRouter for manifest-driven dispatch (ADR 0002)"
```

### Task 1.8: DrizzleRepository<T> base class

**Files:**
- Create: `packages/infrastructure/src/persistence/drizzle/repositories/_base.ts`
- Create: `packages/infrastructure/src/persistence/drizzle/repositories/_base.spec.ts`

- [ ] **Step 1: Write failing test**

Create `_base.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { DrizzleRepository } from './_base.js';
import type { DrizzleDatabase } from '../client.js';

interface FakeRow {
	readonly id: string;
	readonly name: string;
}

interface FakeAggregate {
	readonly id: string;
	readonly name: string;
}

class FakeRepo extends DrizzleRepository<FakeAggregate, FakeRow> {
	protected toAggregate(row: FakeRow): FakeAggregate {
		return { id: row.id, name: row.name };
	}
}

describe('DrizzleRepository.findById', () => {
	it('returns null when no row matches', async () => {
		const limit = vi.fn().mockResolvedValue([]);
		const where = vi.fn(() => ({ limit }));
		const from = vi.fn(() => ({ where }));
		const select = vi.fn(() => ({ from }));
		const db = { select } as unknown as DrizzleDatabase;
		const table = { id: { name: 'id' } } as unknown as AnyPgTable;
		const repo = new FakeRepo(db, table);
		await expect(repo.findById('nope')).resolves.toBeNull();
	});

	it('returns mapped aggregate when row matches', async () => {
		const limit = vi.fn().mockResolvedValue([{ id: 'a', name: 'Alpha' }]);
		const where = vi.fn(() => ({ limit }));
		const from = vi.fn(() => ({ where }));
		const select = vi.fn(() => ({ from }));
		const db = { select } as unknown as DrizzleDatabase;
		const table = { id: { name: 'id' } } as unknown as AnyPgTable;
		const repo = new FakeRepo(db, table);
		await expect(repo.findById('a')).resolves.toEqual({ id: 'a', name: 'Alpha' });
	});
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
pnpm --filter @rankpulse/infrastructure test -- _base.spec
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `_base.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { DrizzleDatabase } from '../client.js';

/**
 * Base class for Drizzle repositories that exposes the universal
 * `findById` pattern. Subclasses MUST implement `toAggregate(row)` to
 * convert a row to the bounded-context aggregate.
 *
 * Save, delete, and complex queries stay in subclasses — they often need
 * `ON CONFLICT DO UPDATE`, projections, or time-series filters that are
 * specific to each aggregate's schema.
 *
 * The `table` parameter is typed broadly (AnyPgTable) so subclasses can
 * pass any table; runtime relies on the table having an `id` column with
 * a `.name` of `'id'`.
 *
 * See ADR 0002 for the rationale (38 repos shared this pattern).
 */
export abstract class DrizzleRepository<TAggregate, TRow extends { id: string }> {
	constructor(
		protected readonly db: DrizzleDatabase,
		protected readonly table: AnyPgTable,
	) {}

	async findById(id: string): Promise<TAggregate | null> {
		const idColumn = (this.table as unknown as { id: { name: string } }).id;
		const rows = await this.db.select().from(this.table).where(eq(idColumn as never, id)).limit(1);
		const row = rows[0] as TRow | undefined;
		return row ? this.toAggregate(row) : null;
	}

	protected abstract toAggregate(row: TRow): TAggregate;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @rankpulse/infrastructure test -- _base.spec
```

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/src/persistence/drizzle/repositories/_base.ts \
        packages/infrastructure/src/persistence/drizzle/repositories/_base.spec.ts
git commit -m "feat(infrastructure): DrizzleRepository<T> base for universal findById (ADR 0002)"
```

---

## Phase 2 — Schema split per context

### Task 2.1: Verify drizzle-kit baseline (no diff)

- [ ] **Step 1: Run drizzle-kit generate against current main**

```bash
pnpm --filter @rankpulse/infrastructure db:generate
```

Expected: NO diff (no new migration files). Confirms baseline. If a diff appears, halt and investigate before continuing.

- [ ] **Step 2: Note baseline migration count**

```bash
ls packages/infrastructure/src/persistence/drizzle/migrations/*.sql | wc -l
```

Record the count (e.g. "15 migrations on baseline"). Used to verify the split produces zero new migrations.

### Task 2.2: Move tables to per-context schema files

The `schema/index.ts` (1175 LOC) splits into 13 files. **One commit per context** keeps the diff reviewable.

For EACH context in this list, follow the template below:

| Context file | Tables to move |
|---|---|
| `identity-access.ts` | organizations, users, memberships, apiTokens |
| `project-management.ts` | projects, projectDomains, projectLocations, keywordLists, keywords, competitors, competitorSuggestions, portfolios |
| `rank-tracking.ts` | trackedKeywords, rankingObservations |
| `search-console-insights.ts` | gscProperties, gscObservations |
| `traffic-analytics.ts` | ga4Properties, ga4DailyMetrics |
| `web-performance.ts` | trackedPages, pageSpeedSnapshots |
| `entity-awareness.ts` | wikipediaArticles, wikipediaPageviews |
| `bing-webmaster-insights.ts` | bingProperties, bingTrafficObservations |
| `macro-context.ts` | monitoredDomains, radarRankSnapshots |
| `experience-analytics.ts` | clarityProjects, experienceSnapshots (or whichever tables exist) |
| `ai-search-insights.ts` | brandPrompts, llmAnswers (verify exact list at split time) |
| `meta-ads-attribution.ts` | metaPixels, metaAdAccounts, metaPixelEventsDaily, metaAdsInsightsDaily |
| `provider-connectivity.ts` | providerCredentials, providerJobDefinitions, providerJobRuns, rawPayloads, apiUsageEntries |

**Template (executed for each context — 13 commits in this task)**:

- [ ] **Step T.1: Create the per-context file**

`touch packages/infrastructure/src/persistence/drizzle/schema/<context>.ts`

- [ ] **Step T.2: Move table declarations**

Copy the block of `pgTable` declarations + their `relations` (if any) for the listed tables FROM `schema/index.ts` INTO `schema/<context>.ts`. Preserve imports — `schema/<context>.ts` will need `pgTable, uuid, text, timestamp, integer, doublePrecision, jsonb, primaryKey, uniqueIndex, index, foreignKey` from `drizzle-orm/pg-core`. Foreign-key references to tables in OTHER contexts (e.g. `projects.id`) require importing those tables from their new module.

- [ ] **Step T.3: Re-export from `schema/index.ts`**

In `schema/index.ts`, replace the moved table declarations with:

```ts
export * from './<context>.js';
```

- [ ] **Step T.4: Run drizzle-kit generate — verify zero diff**

```bash
pnpm --filter @rankpulse/infrastructure db:generate
```

Expected: NO new migration. If a diff appears, the split changed semantic table identity (column order, FK ordering, etc.) — investigate before continuing.

- [ ] **Step T.5: Typecheck**

```bash
pnpm --filter @rankpulse/infrastructure typecheck
```

- [ ] **Step T.6: Commit**

```bash
git add packages/infrastructure/src/persistence/drizzle/schema/
git commit -m "refactor(infrastructure): split <context> tables into schema/<context>.ts (ADR 0002)"
```

### Task 2.3: Final schema barrel verification

- [ ] **Step 1: Verify schema/index.ts is now <30 LOC**

```bash
wc -l packages/infrastructure/src/persistence/drizzle/schema/index.ts
```

Expected: ≤ 30 lines (one `export * from './<context>.js'` per context + maybe a header comment).

- [ ] **Step 2: Run all tests + final drizzle-kit check**

```bash
pnpm typecheck && pnpm test && pnpm --filter @rankpulse/infrastructure db:generate
```

Expected: all green; zero migration diff.

---

## Phase 3 — Provider migrations (14 commits)

Each provider migrates with the same pattern. **Detailed template** is shown for the FIRST provider (DataForSEO); the others follow the same template with the substitutions listed at the end.

### Task 3.1: Migrate `dataforseo` (FULL TEMPLATE)

**Files:**
- Modify: `packages/providers/dataforseo/src/http.ts` (extend `BaseHttpClient`)
- Delete: `packages/providers/dataforseo/src/http.ts`'s inline `<X>ApiError` class (replaced by `ProviderApiError`)
- Create: `packages/providers/dataforseo/src/manifest.ts`
- Modify: `packages/providers/dataforseo/src/index.ts` (export manifest)
- Modify: `packages/providers/dataforseo/src/provider.ts` (still exists temporarily; deleted in Phase 7)

- [ ] **Step 1: Read the existing `http.ts`**

```bash
cat packages/providers/dataforseo/src/http.ts
```

Note: auth strategy used (basic with username:password split), endpoints called, error class shape, any custom retry/timeout logic.

- [ ] **Step 2: Refactor `http.ts` to extend `BaseHttpClient`**

Replace the file contents (keep what's specific, remove what's now in BaseHttpClient):

```ts
import { BaseHttpClient, type HttpConfig } from '@rankpulse/provider-core';

/**
 * DataForSEO uses HTTP basic auth with `email:api_password` as the
 * username:password pair. The default basic-auth header in BaseHttpClient
 * works as-is when the credential's plaintextSecret is stored in that exact
 * format — which is what RegisterProviderCredentialUseCase stores after
 * validateCredentialPlaintext (see manifest.ts).
 */
export class DataForSeoHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig) {
		super('dataforseo', config);
	}
	// no overrides needed; default applyAuth handles basic
}
```

Delete any `DataForSeoApiError` class that existed; consumers now use `ProviderApiError` from `@rankpulse/provider-core`.

- [ ] **Step 3: Create `manifest.ts`**

```ts
import type { ProviderManifest, AuthStrategy } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
// import the existing endpoint descriptors + fetch + acl functions from this package
import { serpGoogleOrganicLiveDescriptor, fetchSerpGoogleOrganicLive } from './endpoints/serp-google-organic-live.js';
// ... (one import per endpoint)

const auth: AuthStrategy = { kind: 'basic' };

export const dataforseoProviderManifest: ProviderManifest = {
	id: 'dataforseo',
	displayName: 'DataForSEO',
	http: {
		baseUrl: 'https://api.dataforseo.com',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		if (!plaintextSecret.includes(':')) {
			throw new InvalidInputError(
				'DataForSEO credentials must be in the format "email:api_password" (colon-separated).',
			);
		}
	},
	endpoints: [
		{
			descriptor: serpGoogleOrganicLiveDescriptor,
			fetch: fetchSerpGoogleOrganicLive,
			ingest: {
				useCaseKey: 'rank-tracking:record-ranking-observation',
				systemParamKey: 'trackedKeywordId',
				acl: (response, ctx) => {
					// the existing extractor function from this package
					return extractRankingRows(response, ctx.endpointParams.locationCode as number);
				},
			},
		},
		// ... (one EndpointManifest per endpoint in the existing provider)
	],
};
```

The exact endpoint list comes from the existing `discover()` method in the old `DataForSeoProvider` class. Copy each descriptor + fetch + acl reference. For non-rank-tracking endpoints (e.g. SERP advanced, keywords-data, dataforseo-labs-*), set `ingest: null` if they're raw-only OR set the appropriate `useCaseKey` from the rank-tracking / project-management contexts.

- [ ] **Step 4: Update `index.ts` to export the manifest**

In `packages/providers/dataforseo/src/index.ts`, add:

```ts
export { dataforseoProviderManifest } from './manifest.js';
```

Keep the existing `DataForSeoProvider` export for now (deleted in Phase 7).

- [ ] **Step 5: Update existing `provider.ts` to use the new `DataForSeoHttpClient`**

The existing `DataForSeoProvider` class probably constructs its own HTTP. Update it to use `new DataForSeoHttpClient({ baseUrl, auth })`. Keep its `discover()` and `fetch()` methods working — they're consumed by the OLD code path until Phase 6 rewires.

- [ ] **Step 6: Typecheck the package**

```bash
pnpm --filter @rankpulse/provider-dataforseo typecheck
```

- [ ] **Step 7: Run package tests**

```bash
pnpm --filter @rankpulse/provider-dataforseo test
```

Expected: existing tests pass (HTTP behaviour is unchanged; auth headers identical).

- [ ] **Step 8: Run full repo tests + typecheck**

```bash
pnpm typecheck && pnpm test
```

Expected: all green. The OLD code path still works (composition-root still uses `DataForSeoProvider`); the NEW manifest export is added but unused yet.

- [ ] **Step 9: Commit**

```bash
git add packages/providers/dataforseo/
git commit -m "feat(provider-dataforseo): manifest + BaseHttpClient migration (ADR 0002)"
```

### Tasks 3.2–3.14: migrate the other 13 providers

Apply the same template as 3.1 with these substitutions:

| Provider | id | displayName | Auth strategy | http.ts complexity notes |
|---|---|---|---|---|
| `gsc` | `google-search-console` | `Google Search Console` | `service-account-jwt` | Existing JWT-exchange code stays; override `applyAuth` |
| `ga4` | `google-analytics-4` | `Google Analytics 4` | `service-account-jwt` | Same JWT pattern as GSC |
| `bing` | `bing-webmaster` | `Bing Webmaster Tools` | `api-key-header` (header `apikey`) | Already has timeout from PR #88; default applies |
| `wikipedia` | `wikipedia` | `Wikipedia` | `bearer-token` (no auth — pass empty header) OR `custom` if no auth | Confirm at task time |
| `clarity` | `microsoft-clarity` | `Microsoft Clarity` | `api-key-header` (`Authorization`) | Bearer-token semantically; map to api-key-header |
| `cloudflare-radar` | `cloudflare-radar` | `Cloudflare Radar` | `bearer-token` | Default applies |
| `pagespeed` | `pagespeed` | `PageSpeed Insights` | `api-key-or-service-account-jwt` | Polymorphic per #66; manifest's auth says `api-key-or-service-account-jwt` and the http client overrides `applyAuth` based on credential format |
| `meta` | `meta` | `Meta` | `oauth-token` | Default Bearer applies |
| `brevo` | `brevo` | `Brevo` | `api-key-header` (`api-key`) | Default applies |
| `openai` | `openai` | `OpenAI` | `bearer-token` | Default applies |
| `anthropic` | `anthropic` | `Anthropic` | `api-key-header` (`x-api-key`) + version header | Override `applyAuth` to add `anthropic-version` |
| `perplexity` | `perplexity` | `Perplexity` | `bearer-token` | Default applies |
| `google-ai-studio` | `google-ai-studio` | `Google AI Studio` | `api-key-header` (`x-goog-api-key`) | Default applies |

**Per-task checklist** (one per provider — 13 commits):

For `<provider>` in the list above:

- [ ] Read existing `packages/providers/<provider>/src/http.ts`
- [ ] Refactor to extend `BaseHttpClient`. Override `applyAuth` ONLY if the strategy isn't covered by the default switch.
- [ ] Delete the inline `<X>ApiError` class
- [ ] Create `packages/providers/<provider>/src/manifest.ts` exporting `<provider>ProviderManifest: ProviderManifest`
- [ ] Update `packages/providers/<provider>/src/index.ts` to export the manifest
- [ ] Update existing `provider.ts` to use the new HTTP client class
- [ ] `pnpm --filter @rankpulse/provider-<provider> typecheck && pnpm --filter @rankpulse/provider-<provider> test` — both pass
- [ ] `pnpm typecheck && pnpm test` (full repo) — all green
- [ ] Commit: `feat(provider-<id>): manifest + BaseHttpClient migration (ADR 0002)`

---

## Phase 4 — Context module migrations (13 commits)

Each context wraps its current wiring into a `ContextModule.compose(deps)`. **Detailed template** for the first context (`meta-ads-attribution`); the rest substitute.

### Task 4.1: Migrate `meta-ads-attribution` (FULL TEMPLATE)

**Files:**
- Create: `packages/application/meta-ads-attribution/src/module.ts`
- Modify: `packages/application/meta-ads-attribution/src/index.ts`
- Modify: `packages/application/meta-ads-attribution/package.json` (add `@rankpulse/application-core` + `@rankpulse/infrastructure` deps)

- [ ] **Step 1: Add deps**

```bash
pnpm --filter @rankpulse/application-meta-ads-attribution add @rankpulse/application-core@workspace:* @rankpulse/infrastructure@workspace:*
```

(Names approximate — use the actual package names from the existing `package.json` files.)

- [ ] **Step 2: Create `module.ts`**

```ts
import type { ContextModule, ContextRegistrations, IngestUseCase } from '@rankpulse/application-core';
import { buildAutoScheduleHandlers, type AutoScheduleConfig } from '@rankpulse/application-core';
import { DrizzlePersistence } from '@rankpulse/infrastructure';
import {
	IngestMetaPixelEventsUseCase,
	IngestMetaAdsInsightsUseCase,
	LinkMetaPixelUseCase,
	LinkMetaAdAccountUseCase,
	UnlinkMetaPixelUseCase,
	UnlinkMetaAdAccountUseCase,
	QueryMetaPixelEventsUseCase,
	QueryMetaAdsInsightsUseCase,
} from './use-cases/index.js';
import { metaPixels, metaAdAccounts, metaPixelEventsDaily, metaAdsInsightsDaily } from '@rankpulse/infrastructure/persistence/drizzle/schema/meta-ads-attribution';

const META_PIXEL_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'meta',
	endpointId: 'meta-pixel-events-stats',
	cron: '30 4 * * *',
	systemParamKey: 'metaPixelId',
};

const META_AD_ACCOUNT_AUTO_SCHEDULES = [
	{
		providerId: 'meta',
		endpointId: 'meta-ads-insights',
		cron: '45 4 * * *',
		systemParamKey: 'metaAdAccountId',
		paramsBuilder: (event: any) => ({
			adAccountId: event.adAccountHandle,
			startDate: '{{today-30}}',
			endDate: '{{today-1}}',
		}),
		systemParamsBuilder: (event: any) => ({
			organizationId: event.organizationId,
			metaAdAccountId: event.metaAdAccountId,
		}),
	},
	{
		providerId: 'meta',
		endpointId: 'meta-custom-audiences',
		cron: '0 5 * * 1',
		systemParamKey: 'metaAdAccountId',
		paramsBuilder: (event: any) => ({ adAccountId: event.adAccountHandle }),
		systemParamsBuilder: (event: any) => ({
			organizationId: event.organizationId,
			metaAdAccountId: event.metaAdAccountId,
		}),
	},
] as const;

export const metaAdsAttributionModule: ContextModule = {
	id: 'meta-ads-attribution',
	compose: (deps): ContextRegistrations => {
		const drizzleDb = (deps as any).drizzle.db;
		const eventsPub = (deps as any).events;
		const clock = (deps as any).clock;

		// Repos
		const pixelRepo = new DrizzlePersistence.DrizzleMetaPixelRepository(drizzleDb);
		const adAccountRepo = new DrizzlePersistence.DrizzleMetaAdAccountRepository(drizzleDb);
		const pixelEventDailyRepo = new DrizzlePersistence.DrizzleMetaPixelEventDailyRepository(drizzleDb);
		const adsInsightDailyRepo = new DrizzlePersistence.DrizzleMetaAdsInsightDailyRepository(drizzleDb);

		// Use cases
		const linkMetaPixel = new LinkMetaPixelUseCase(pixelRepo, clock, (deps as any).ids, eventsPub);
		const linkMetaAdAccount = new LinkMetaAdAccountUseCase(adAccountRepo, clock, (deps as any).ids, eventsPub);
		const unlinkMetaPixel = new UnlinkMetaPixelUseCase(pixelRepo, clock);
		const unlinkMetaAdAccount = new UnlinkMetaAdAccountUseCase(adAccountRepo, clock);
		const ingestMetaPixelEvents = new IngestMetaPixelEventsUseCase(pixelRepo, pixelEventDailyRepo, eventsPub, clock);
		const ingestMetaAdsInsights = new IngestMetaAdsInsightsUseCase(adAccountRepo, adsInsightDailyRepo, eventsPub, clock);
		const queryMetaPixelEvents = new QueryMetaPixelEventsUseCase(pixelRepo, pixelEventDailyRepo);
		const queryMetaAdsInsights = new QueryMetaAdsInsightsUseCase(adAccountRepo, adsInsightDailyRepo);

		// Auto-schedule via the new factory
		const autoScheduleConfigs: AutoScheduleConfig[] = [
			{
				event: 'MetaPixelLinked',
				schedule: {
					...META_PIXEL_AUTO_SCHEDULE_DEFAULTS,
					paramsBuilder: (event) => ({
						pixelId: (event as any).pixelHandle,
						startDate: '{{today-30}}',
						endDate: '{{today-1}}',
					}),
					systemParamsBuilder: (event) => ({
						organizationId: (event as any).organizationId,
						metaPixelId: (event as any).metaPixelId,
					}),
				},
			},
			{
				event: 'MetaAdAccountLinked',
				schedules: META_AD_ACCOUNT_AUTO_SCHEDULES,
			},
		];
		const eventHandlers = buildAutoScheduleHandlers(deps, autoScheduleConfigs);

		// Wrap ingest use cases to match IngestUseCase contract (rows + systemParams)
		const ingestPixelEventsAdapter: IngestUseCase = {
			execute: async (input) => {
				await ingestMetaPixelEvents.execute({
					metaPixelId: input.systemParams.metaPixelId as string,
					rawPayloadId: input.rawPayloadId,
					rows: input.rows as never,
				});
			},
		};
		const ingestAdsInsightsAdapter: IngestUseCase = {
			execute: async (input) => {
				await ingestMetaAdsInsights.execute({
					metaAdAccountId: input.systemParams.metaAdAccountId as string,
					rawPayloadId: input.rawPayloadId,
					rows: input.rows as never,
				});
			},
		};

		return {
			useCases: {
				LinkMetaPixel: linkMetaPixel,
				LinkMetaAdAccount: linkMetaAdAccount,
				UnlinkMetaPixel: unlinkMetaPixel,
				UnlinkMetaAdAccount: unlinkMetaAdAccount,
				QueryMetaPixelEvents: queryMetaPixelEvents,
				QueryMetaAdsInsights: queryMetaAdsInsights,
			},
			ingestUseCases: {
				'meta:pixel-events-ingest': ingestPixelEventsAdapter,
				'meta:ads-insights-ingest': ingestAdsInsightsAdapter,
			},
			eventHandlers,
			schemaTables: [metaPixels, metaAdAccounts, metaPixelEventsDaily, metaAdsInsightsDaily],
		};
	},
};
```

The `(deps as any).drizzle.db` casts are a temporary bridge — `SharedDeps` is opaque from `application-core`'s perspective (layer purity). The cast is type-safe at composition time because `apps/api/src/composition/shared-deps.ts` provides the actual typed shape.

- [ ] **Step 3: Update `index.ts`**

In `packages/application/meta-ads-attribution/src/index.ts`, append:

```ts
export { metaAdsAttributionModule } from './module.js';
```

- [ ] **Step 4: Typecheck + test the package**

```bash
pnpm --filter @rankpulse/application-meta-ads-attribution typecheck
pnpm --filter @rankpulse/application-meta-ads-attribution test
```

- [ ] **Step 5: Full repo gate**

```bash
pnpm typecheck && pnpm test
```

Expected: all green. The OLD composition-root still does explicit wiring; the NEW module export is added but unused yet.

- [ ] **Step 6: Commit**

```bash
git add packages/application/meta-ads-attribution/
git commit -m "feat(meta-ads-attribution): ContextModule with auto-schedule configs (ADR 0002)"
```

### Tasks 4.2–4.13: migrate the other 12 contexts

Apply the same template per context. Substitution table:

| Context | id | Auto-schedule events (just list event types) | Ingest use case keys |
|---|---|---|---|
| `identity-access` | `identity-access` | (none) | (none) |
| `project-management` | `project-management` | (none — could grow later) | (none) |
| `rank-tracking` | `rank-tracking` | (TBD: KeywordTrackingStarted? — SERP fan-out is different) | `rank-tracking:record-ranking-observation` |
| `search-console-insights` | `search-console-insights` | `GscPropertyLinked` | `search-console-insights:ingest-gsc-rows` |
| `traffic-analytics` | `traffic-analytics` | `Ga4PropertyLinked` | `traffic-analytics:ingest-ga4-rows` |
| `web-performance` | `web-performance` | `TrackedPageAdded` | `web-performance:record-page-speed-snapshot` |
| `entity-awareness` | `entity-awareness` | `WikipediaArticleLinked` | `entity-awareness:ingest-wikipedia-pageviews` |
| `bing-webmaster-insights` | `bing-webmaster-insights` | `BingPropertyLinked` | `bing-webmaster-insights:ingest-bing-traffic` |
| `macro-context` | `macro-context` | `MonitoredDomainAdded` | `macro-context:record-radar-rank` |
| `experience-analytics` | `experience-analytics` | `ClarityProjectLinked` | `experience-analytics:record-experience-snapshot` |
| `ai-search-insights` | `ai-search-insights` | `BrandPromptCreated` (uses `dynamicSchedules` for fan-out) | `ai-search-insights:record-llm-answer` |
| `provider-connectivity` | `provider-connectivity` | (none — this is the orchestration context) | (none) |

**Per-context checklist** (one commit per context — 12 commits):

- [ ] Add deps to package.json (`@rankpulse/application-core`, `@rankpulse/infrastructure`)
- [ ] Create `module.ts` mirroring the meta-ads-attribution template
- [ ] List all repos to construct from `deps.drizzle`
- [ ] Instantiate every existing use case
- [ ] Build the auto-schedule configs from the existing standalone handlers' content
- [ ] Build ingest use case adapters for each ingest entry needed
- [ ] Return `ContextRegistrations` with `useCases`, `ingestUseCases`, `eventHandlers`, `schemaTables`
- [ ] Update barrel `index.ts` to export the module
- [ ] Typecheck + test the package
- [ ] Full repo gate
- [ ] Commit: `feat(<context>): ContextModule (ADR 0002)`

---

## Phase 5 — Activate IngestRouter in worker processor

### Task 5.1: Wire IngestRouter into ProviderFetchProcessor

**Files:**
- Modify: `apps/worker/src/processors/provider-fetch.processor.ts`
- Modify: `apps/worker/src/main.ts` (build the router from manifests + ingest use cases)

- [ ] **Step 1: Add `ingestRouter` to `ProviderFetchProcessorDeps`**

In `provider-fetch.processor.ts`, modify the deps interface to include:

```ts
import type { IngestRouter } from './ingest-router.js';

interface ProviderFetchProcessorDeps {
	// ... existing fields
	ingestRouter: IngestRouter;
}
```

- [ ] **Step 2: Replace the 12 if-else dispatch blocks with one call**

Find the section in `provider-fetch.processor.ts` (lines ~347–723) that dispatches by (providerId, endpointId). Delete the 12 blocks. Replace with:

```ts
await this.deps.ingestRouter.dispatch({
	providerId: definition.providerId.value,
	endpointId: definition.endpointId.value,
	fetchResult,
	rawPayloadId,
	definition,
	dateBucket,
});
```

- [ ] **Step 3: Build the router in `apps/worker/src/main.ts`**

Import the manifests + the merged ingest use cases (which come from iterating context modules — but Phase 6 sets that up cleanly). For now in Phase 5, build a temporary inline merge from the existing per-context exports until Phase 6 replaces it:

```ts
import { buildIngestRouter } from './processors/ingest-router.js';
import { dataforseoProviderManifest } from '@rankpulse/provider-dataforseo';
// ... import all 14 manifests

const providerManifests = [
	dataforseoProviderManifest,
	// ... 13 more
];

// Temporary inline mapping (replaced by module iteration in Phase 6)
const ingestUseCases = {
	'rank-tracking:record-ranking-observation': /* adapter wrapping recordRankingObservationUseCase */,
	'search-console-insights:ingest-gsc-rows': /* ... */,
	// ... all 11 keys
};

const ingestRouter = buildIngestRouter(providerManifests, ingestUseCases);

const processor = new ProviderFetchProcessor({ /* existing deps */, ingestRouter });
```

- [ ] **Step 4: Run worker tests + full gate**

```bash
pnpm --filter @rankpulse/worker test && pnpm typecheck && pnpm test
```

Expected: all green. Worker now uses IngestRouter for dispatch; old if-else blocks gone.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processors/provider-fetch.processor.ts \
        apps/worker/src/main.ts
git commit -m "feat(worker): activate IngestRouter, drop 12 if-else dispatch blocks (ADR 0002)"
```

### Task 5.2: Verify processor LOC delta

- [ ] **Step 1: Confirm processor shrunk**

```bash
wc -l apps/worker/src/processors/provider-fetch.processor.ts
```

Expected: ≤ 350 LOC (down from 818).

---

## Phase 6 — composition-root + worker main rewrite

### Task 6.1: Implement `buildSharedDeps`

**Files:**
- Create: `apps/api/src/composition/shared-deps.ts`

- [ ] **Step 1: Implement**

```ts
import { Crypto, DrizzlePersistence, Events, Queue as QueueAdapters } from '@rankpulse/infrastructure';
import { SystemClock, SystemIdGenerator } from '@rankpulse/shared';
import { JwtService } from '../common/auth/jwt.service.js';
import { pino, type Logger } from 'pino';
import type { AppEnv } from '../config/env.js';

export interface SharedDeps {
	readonly _brand: 'SharedDeps';
	readonly drizzle: DrizzlePersistence.DrizzleClient;
	readonly redis: { url: string };
	readonly clock: typeof SystemClock;
	readonly ids: typeof SystemIdGenerator;
	readonly events: Events.InMemoryEventPublisher;
	readonly logger: Logger;
	// scheduleEndpointFetch is constructed by the provider-connectivity module and threaded back into modules; circular avoidance: contexts that need it pull it from a shared registry passed by composition-root after first pass.
	readonly passwordHasher: Crypto.Argon2PasswordHasher;
	readonly credentialVault: Crypto.LibsodiumCredentialVault;
	readonly jwtService: JwtService;
	readonly apiTokenGenerator: Crypto.Sha256ApiTokenGenerator;
}

export function buildSharedDeps(env: AppEnv): SharedDeps {
	const drizzle = DrizzlePersistence.createDrizzleClient({ connectionString: env.DATABASE_URL });
	const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });
	return {
		_brand: 'SharedDeps',
		drizzle,
		redis: { url: env.REDIS_URL },
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: new Events.InMemoryEventPublisher(),
		logger,
		passwordHasher: new Crypto.Argon2PasswordHasher(),
		credentialVault: new Crypto.LibsodiumCredentialVault(env.RANKPULSE_MASTER_KEY),
		jwtService: new JwtService(env.JWT_SECRET, env.JWT_TTL_SECONDS),
		apiTokenGenerator: new Crypto.Sha256ApiTokenGenerator(),
	};
}
```

Note: `scheduleEndpointFetch` is omitted from `SharedDeps` because it has a circular dependency (constructed inside the `provider-connectivity` module). Resolution: the `provider-connectivity` module's `compose()` is run FIRST; its `scheduleEndpointFetch` is added to a SecondPassDeps record, and ALL OTHER modules' `compose()` runs with the augmented deps. See Task 6.3.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/composition/shared-deps.ts
git commit -m "feat(api): buildSharedDeps factory (ADR 0002)"
```

### Task 6.2: Manifests + modules registries

**Files:**
- Create: `apps/api/src/composition/manifests.ts`
- Create: `apps/api/src/composition/modules.ts`

- [ ] **Step 1: Manifests**

```ts
// apps/api/src/composition/manifests.ts
import type { ProviderManifest } from '@rankpulse/provider-core';
import { dataforseoProviderManifest } from '@rankpulse/provider-dataforseo';
import { gscProviderManifest } from '@rankpulse/provider-gsc';
import { ga4ProviderManifest } from '@rankpulse/provider-ga4';
import { bingProviderManifest } from '@rankpulse/provider-bing';
import { wikipediaProviderManifest } from '@rankpulse/provider-wikipedia';
import { clarityProviderManifest } from '@rankpulse/provider-microsoft-clarity';
import { cloudflareRadarProviderManifest } from '@rankpulse/provider-cloudflare-radar';
import { pageSpeedProviderManifest } from '@rankpulse/provider-pagespeed';
import { metaProviderManifest } from '@rankpulse/provider-meta';
import { brevoProviderManifest } from '@rankpulse/provider-brevo';
import { openAiProviderManifest } from '@rankpulse/provider-openai';
import { anthropicProviderManifest } from '@rankpulse/provider-anthropic';
import { perplexityProviderManifest } from '@rankpulse/provider-perplexity';
import { googleAiStudioProviderManifest } from '@rankpulse/provider-google-ai-studio';

export const providerManifests: readonly ProviderManifest[] = [
	dataforseoProviderManifest,
	gscProviderManifest,
	ga4ProviderManifest,
	bingProviderManifest,
	wikipediaProviderManifest,
	clarityProviderManifest,
	cloudflareRadarProviderManifest,
	pageSpeedProviderManifest,
	metaProviderManifest,
	brevoProviderManifest,
	openAiProviderManifest,
	anthropicProviderManifest,
	perplexityProviderManifest,
	googleAiStudioProviderManifest,
];
```

- [ ] **Step 2: Modules**

```ts
// apps/api/src/composition/modules.ts
import type { ContextModule } from '@rankpulse/application-core';
import { identityAccessModule } from '@rankpulse/application-identity-access';
import { projectManagementModule } from '@rankpulse/application-project-management';
import { rankTrackingModule } from '@rankpulse/application-rank-tracking';
import { searchConsoleInsightsModule } from '@rankpulse/application-search-console-insights';
import { trafficAnalyticsModule } from '@rankpulse/application-traffic-analytics';
import { webPerformanceModule } from '@rankpulse/application-web-performance';
import { entityAwarenessModule } from '@rankpulse/application-entity-awareness';
import { bingWebmasterInsightsModule } from '@rankpulse/application-bing-webmaster-insights';
import { macroContextModule } from '@rankpulse/application-macro-context';
import { experienceAnalyticsModule } from '@rankpulse/application-experience-analytics';
import { aiSearchInsightsModule } from '@rankpulse/application-ai-search-insights';
import { metaAdsAttributionModule } from '@rankpulse/application-meta-ads-attribution';
import { providerConnectivityModule } from '@rankpulse/application-provider-connectivity';

export const contextModules: readonly ContextModule[] = [
	providerConnectivityModule, // FIRST: provides scheduleEndpointFetch needed by others
	identityAccessModule,
	projectManagementModule,
	rankTrackingModule,
	searchConsoleInsightsModule,
	trafficAnalyticsModule,
	webPerformanceModule,
	entityAwarenessModule,
	bingWebmasterInsightsModule,
	macroContextModule,
	experienceAnalyticsModule,
	aiSearchInsightsModule,
	metaAdsAttributionModule,
];
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/composition/manifests.ts apps/api/src/composition/modules.ts
git commit -m "feat(api): manifest + module registries (ADR 0002)"
```

### Task 6.3: Rewrite composition-root.ts

- [ ] **Step 1: Replace the 793-LOC body with the iteration loop**

Replace `apps/api/src/composition/composition-root.ts` with the structure shown in the design doc Section 1's "Composition root after refactor" sketch.

Key implementation note: `scheduleEndpointFetch` is built by `providerConnectivityModule.compose()` FIRST. Its registrations include `useCases.ScheduleEndpointFetch` which is then appended to deps before the other modules' `compose()` is called. Pattern:

```ts
const sharedDeps = buildSharedDeps(env);

// First pass: only provider-connectivity (provides scheduleEndpointFetch)
const pcRegs = providerConnectivityModule.compose(sharedDeps);

// Augmented deps for the rest
const fullDeps = {
	...sharedDeps,
	scheduleEndpointFetch: pcRegs.useCases.ScheduleEndpointFetch,
};

// Second pass: all other modules
const otherRegs = contextModules
	.filter((m) => m.id !== 'provider-connectivity')
	.map((m) => m.compose(fullDeps));

const allRegs = [pcRegs, ...otherRegs];

// Merge ingestUseCases
const ingestUseCases: Record<string, IngestUseCase> = {};
for (const r of allRegs) Object.assign(ingestUseCases, r.ingestUseCases);

// Build registry from manifests
const providerRegistry = new ProviderRegistry();
for (const m of providerManifests) providerRegistry.register(m);

// Subscribe handlers
for (const r of allRegs) {
	for (const h of r.eventHandlers) {
		for (const eventType of h.events) {
			sharedDeps.events.on(eventType, h.handle);
		}
	}
}

// Build the IngestRouter (for the worker — see also worker main.ts which does the same)
const ingestRouter = buildIngestRouter(providerManifests, ingestUseCases);

// Build NestJS providers from the merged useCases + sharedDeps
const providers = buildNestProvidersFromRegistrations(allRegs, sharedDeps, providerRegistry, ingestRouter);
```

- [ ] **Step 2: Verify LOC**

```bash
wc -l apps/api/src/composition/composition-root.ts
```

Expected: ≤ 200 LOC.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/composition/composition-root.ts
git commit -m "feat(api): rewrite composition-root to iterate manifests + modules (ADR 0002)"
```

### Task 6.4: Rewrite `apps/worker/src/main.ts`

Mirror the api composition pattern. Worker doesn't need the NestJS provider building, but does need: `buildSharedDeps`, two-pass module compose for `scheduleEndpointFetch`, manifest list for the ProviderRegistry, IngestRouter from manifests + ingestUseCases, and the BullMQ Worker per provider.

- [ ] **Step 1: Replace `apps/worker/src/main.ts` body**

Use the shared `buildSharedDeps` (move it to a shared location if needed — `packages/infrastructure` or a new `apps/_shared/`). Same two-pass compose. Then build the IngestRouter, instantiate `ProviderFetchProcessor` with it, and start BullMQ workers for each provider in the manifest list.

- [ ] **Step 2: Verify LOC**

```bash
wc -l apps/worker/src/main.ts
```

Expected: ≤ 150 LOC (down from 290).

- [ ] **Step 3: Run worker tests + full gate**

```bash
pnpm --filter @rankpulse/worker typecheck
pnpm --filter @rankpulse/worker test
pnpm typecheck && pnpm test && pnpm build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/main.ts apps/worker/package.json
git commit -m "feat(worker): rewrite main.ts to share composition with api (ADR 0002)"
```

---

## Phase 7 — Cleanup

### Task 7.1: Delete the 10 standalone auto-schedule handler files

**Files (delete):**
- `packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.ts` + `.spec.ts`
- `packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.ts` + `.spec.ts`
- `packages/application/src/entity-awareness/event-handlers/auto-schedule-on-link.handler.ts` + `.spec.ts`
- `packages/application/src/bing-webmaster-insights/event-handlers/auto-schedule-on-link.handler.ts` + `.spec.ts`
- `packages/application/src/experience-analytics/event-handlers/auto-schedule-on-link.handler.ts` + `.spec.ts`
- `packages/application/src/web-performance/event-handlers/auto-schedule-on-add.handler.ts` + `.spec.ts`
- `packages/application/src/macro-context/event-handlers/auto-schedule-on-add.handler.ts` + `.spec.ts`
- `packages/application/src/ai-search-insights/event-handlers/auto-schedule-on-brand-prompt-created.handler.ts` + `.spec.ts`
- `packages/application/src/meta-ads-attribution/event-handlers/auto-schedule-on-meta-pixel-linked.handler.ts` + `.spec.ts`
- `packages/application/src/meta-ads-attribution/event-handlers/auto-schedule-on-meta-ad-account-linked.handler.ts` + `.spec.ts`

- [ ] **Step 1: Delete files**

```bash
rm packages/application/src/search-console-insights/event-handlers/auto-schedule-on-link.handler.{ts,spec.ts}
rm packages/application/src/traffic-analytics/event-handlers/auto-schedule-on-link.handler.{ts,spec.ts}
# ... (10 file pairs total)
```

- [ ] **Step 2: Update barrels**

For each context's `index.ts`, remove the line:

```ts
export * from './event-handlers/auto-schedule-on-link.handler.js';
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm typecheck && pnpm test
git add -A packages/application/src/
git commit -m "refactor: delete 10 standalone auto-schedule handlers (replaced by ContextModule configs, ADR 0002)"
```

### Task 7.2: Delete the deprecated `Provider` interface

**Files:**
- Modify: `packages/providers/core/src/types.ts` — delete `Provider` interface
- Modify: `packages/providers/core/src/registry.ts` — accept `ProviderManifest` only
- Modify: `packages/providers/core/src/index.ts` — drop `Provider` re-export
- Delete: each provider's `provider.ts` (the class) — the manifest replaces it

- [ ] **Step 1: Verify no remaining `Provider` interface consumers**

```bash
rg "import.*\\bProvider\\b.*from '@rankpulse/provider-core'" packages/ apps/
```

Expected: zero hits (everyone uses `ProviderManifest` now).

- [ ] **Step 2: Update `types.ts`**

Remove the `Provider` interface entirely; keep `EndpointDescriptor`, `FetchContext`, `EndpointCategory`.

- [ ] **Step 3: Update `registry.ts`**

```ts
import { NotFoundError } from '@rankpulse/shared';
import type { ProviderManifest, EndpointManifest } from './manifest.js';
import type { EndpointDescriptor } from './types.js';

export class ProviderRegistry {
	private readonly byId = new Map<string, ProviderManifest>();

	register(manifest: ProviderManifest): void {
		if (this.byId.has(manifest.id)) {
			throw new Error(`Provider "${manifest.id}" is already registered`);
		}
		this.byId.set(manifest.id, manifest);
	}

	has(providerId: string): boolean {
		return this.byId.has(providerId);
	}

	get(providerId: string): ProviderManifest {
		const m = this.byId.get(providerId);
		if (!m) throw new NotFoundError(`Provider "${providerId}" is not registered`);
		return m;
	}

	list(): readonly ProviderManifest[] {
		return [...this.byId.values()];
	}

	endpoint(providerId: string, endpointId: string): EndpointDescriptor {
		const e = this.endpointManifest(providerId, endpointId);
		return e.descriptor;
	}

	endpointManifest(providerId: string, endpointId: string): EndpointManifest {
		const m = this.get(providerId);
		const e = m.endpoints.find((x) => x.descriptor.id === endpointId);
		if (!e) throw new NotFoundError(`Endpoint "${endpointId}" not found on provider "${providerId}"`);
		return e;
	}
}
```

- [ ] **Step 4: Delete each provider's `provider.ts` class**

```bash
rm packages/providers/dataforseo/src/provider.ts
rm packages/providers/gsc/src/provider.ts
# ... (14 files)
```

Each provider's `index.ts` already exports the manifest; remove any leftover `export * from './provider.js'`.

- [ ] **Step 5: Run tests + commit**

```bash
pnpm typecheck && pnpm test
git add -A
git commit -m "refactor: delete deprecated Provider interface + per-provider classes (ADR 0002)"
```

### Task 7.3: Delete unused DI tokens

- [ ] **Step 1: Inspect `tokens.ts`**

```bash
cat apps/api/src/composition/tokens.ts
```

Identify tokens that the new resolution-by-key has replaced (e.g. ingest-use-case tokens that are now resolved via `ingestUseCases` map).

- [ ] **Step 2: Delete unused tokens**

Remove the token constants. Update controller `@Inject(...)` to use the new name (or drop the controller's dependency if no longer needed).

- [ ] **Step 3: Run tests + commit**

```bash
pnpm typecheck && pnpm test
git add apps/api/src/composition/tokens.ts apps/api/src/modules/
git commit -m "refactor(api): drop tokens replaced by manifest-driven ingest resolution (ADR 0002)"
```

---

## Phase 8 — DrizzleRepository<T> adoption (5+ repos)

### Task 8.1–8.5: Convert simple repos to extend `DrizzleRepository<T>`

For 5 representative simple repos (suggested: `DrizzleGscPropertyRepository`, `DrizzleBingPropertyRepository`, `DrizzleMonitoredDomainRepository`, `DrizzleClarityProjectRepository`, `DrizzleMetaPixelRepository`), apply the migration:

**Per-repo template** (one commit per repo — 5 commits):

- [ ] **Step 1: Read existing repo**
- [ ] **Step 2: Refactor to extend `DrizzleRepository<TAggregate, TRow>`**
- [ ] **Step 3: Verify `findById` still works (existing tests)**
- [ ] **Step 4: Run package tests**
- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(infrastructure): <Repo> extends DrizzleRepository<T> (ADR 0002)"
```

---

## Phase 9 — Documentation

### Task 9.1: Update CLAUDE.md § 7

- [ ] **Step 1: Rewrite "Cómo añadir cosas" section**

Replace the existing § 7.2 ("Nuevo provider externo") with a manifest-based recipe. The new recipe:

1. `mkdir packages/providers/<name>` and scaffold its `package.json`.
2. Write `src/manifest.ts` exporting `<name>ProviderManifest: ProviderManifest`.
3. Add the manifest export to `apps/api/src/composition/manifests.ts`.
4. (If new bounded context needed) Scaffold `packages/application/<context>/` with a `module.ts` exporting `<context>Module: ContextModule`. Add to `apps/api/src/composition/modules.ts`.

That's it — no edits to api app, no edits to worker app, no edits to composition-root.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md § 7 for manifest/module pattern (ADR 0002)"
```

### Task 9.2: Add adding-a-provider recipe

**Files:**
- Create: `docs/recipes/adding-a-provider.md`

- [ ] **Step 1: Write the walkthrough**

Step-by-step worked example: adding a fictional "FooProvider" with one endpoint `foo-list-things`.

- [ ] **Step 2: Commit**

```bash
git add docs/recipes/adding-a-provider.md
git commit -m "docs: adding-a-provider recipe (ADR 0002)"
```

---

## Phase 10 — Final validation + PR

### Task 10.1: Full validation gate

- [ ] **Step 1: Run all gates**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: 0 lint errors, 26/26 typecheck, all tests pass, all builds succeed.

- [ ] **Step 2: Verify file size targets**

```bash
wc -l apps/api/src/composition/composition-root.ts \
      apps/worker/src/main.ts \
      apps/worker/src/processors/provider-fetch.processor.ts \
      packages/infrastructure/src/persistence/drizzle/schema/index.ts
```

Targets: ≤ 200 / ≤ 150 / ≤ 350 / ≤ 30 LOC.

### Task 10.2: Push + open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/93-provider-extension-platform
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --repo vgpastor/RankPulse --title "feat: provider extension platform — declarative manifests + context modules (closes #93)" --body "<full body referencing ADR 0002 + design doc + acceptance criteria>"
```

### Task 10.3: Wait for CI green + merge

- [ ] **Step 1: Wait for CI**

Use `until` polling on CI status as in PR #86's flow.

- [ ] **Step 2: Squash merge + delete branch**

```bash
gh pr merge <PR#> --repo vgpastor/RankPulse --squash --delete-branch
```

- [ ] **Step 3: Verify issue #93 closed**

---

## Self-Review

Spec coverage check (each acceptance criterion in the design doc → which task implements it):

| Spec acceptance criterion | Plan task |
|---|---|
| `BaseHttpClient` + `ProviderApiError` + 14 providers extend / migrate | 1.1, 1.3, Phase 3 |
| `ProviderManifest` + `ContextModule` types defined | 1.2, 1.5 |
| 14 providers export `ProviderManifest` | Phase 3 |
| 13 contexts export `ContextModule` | Phase 4 |
| `composition-root.ts` < 200 LOC | 6.3 |
| `apps/worker/src/main.ts` < 150 LOC | 6.4 |
| `provider-fetch.processor.ts` < 300 LOC, 12 if-else gone | 5.1, 5.2 |
| 10 standalone handler files deleted | 7.1 |
| `schema/index.ts` < 30 LOC barrel + per-context files | Phase 2 |
| `DrizzleRepository<T>` exists + 5 repos use it | 1.8, Phase 8 |
| All existing tests pass + new tests + 3 integration | per-task gates + Phase 1 specs |
| CLAUDE.md updated + ADR 0002 committed + recipe | Phase 9 |

All criteria mapped.

Placeholder scan: `<provider>`, `<context>`, `<x>` in templates are deliberate substitution markers, not gaps. No `TBD`/`TODO` remain in concrete code blocks.

Type consistency check: `IngestUseCase`, `EventHandler`, `ContextRegistrations`, `SharedDeps`, `AclContext`, `ProviderManifest`, `EndpointManifest`, `IngestBinding`, `AutoScheduleConfig`, `AutoScheduleSpec`, `IngestRouter` — names are consistent across tasks where they appear.

Plan complete.
