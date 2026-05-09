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
	/**
	 * Factory that builds the provider's HttpClient from `manifest.http`.
	 * The composition root calls this once per manifest at boot to seed
	 * the `ManifestProviderRegistry`; the resulting client is reused
	 * across every endpoint fetch for that provider.
	 *
	 * Each provider package exports its own `XHttpClient` subclass of
	 * `BaseHttpClient` (with auth and body-cap overrides as needed); the
	 * factory just wraps `new XHttpClient(http)`. Lives on the manifest
	 * (not as a class) so the manifest stays a self-contained
	 * declaration that can be consumed without importing the class.
	 */
	readonly buildHttpClient: (http: HttpConfig) => HttpClient;
}

export interface HttpConfig {
	readonly baseUrl: string;
	readonly auth: AuthStrategy;
	readonly defaultTimeoutMs?: number;
	readonly defaultRetries?: number;
	/**
	 * Hard cap on the upstream response body (bytes). When set,
	 * `BaseHttpClient.parseResponse` does a Content-Length pre-flight
	 * AND a post-read length guard, throwing `ProviderApiError(provider,
	 * status, …)` with `message: "response too large"` either way.
	 * Default (undefined): no cap — the parent's behaviour, suitable for
	 * providers whose responses are bounded by their API's own paging.
	 *
	 * Picked per provider based on the upstream's worst-case response:
	 * most APIs cap at 8 MB; DataForSEO SERP-advanced legitimately needs
	 * 32 MB; Wikipedia is constrained to 4 MB by the article-summary
	 * shape. Setting the cap explicitly even when matching the default
	 * documents the choice for the next reader.
	 */
	readonly maxResponseBytes?: number;
}

export type AuthStrategy =
	| { readonly kind: 'bearer-token' }
	| { readonly kind: 'api-key-header'; readonly headerName: string }
	| { readonly kind: 'basic' }
	| { readonly kind: 'oauth-token' }
	| { readonly kind: 'service-account-jwt' }
	| { readonly kind: 'api-key-or-service-account-jwt' }
	| {
			readonly kind: 'custom';
			readonly sign: (req: HttpRequest, plaintextSecret: string) => HttpRequest;
	  };

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
	/**
	 * Extra systemParams the ACL/handler reads beyond the primary
	 * `systemParamKey`. The IngestRouter validates ALL listed keys at
	 * dispatch time and surfaces the missing set in a single
	 * `INGEST_PRECONDITION_FAILED` error so the operator can fix the
	 * schedule in one trip instead of discovering each missing key
	 * across separate runs (#150).
	 *
	 * Use this for unconditional requirements (e.g. domain-intersection
	 * always needs both `ourDomain` and `competitorDomain`). Bindings
	 * whose ACL is polymorphic on a systemParam (e.g. needs
	 * `competitorDomain` only when `scope === 'competitor'`) should NOT
	 * declare those keys here — the ACL keeps its conditional check.
	 */
	readonly additionalSystemParamKeys?: readonly string[];
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

/**
 * Computes the BullMQ-compatible rate-limit envelope (`{ max, duration }`)
 * a Worker should apply when consuming this provider's queue. The provider
 * declares per-endpoint `rateLimit` on each `EndpointDescriptor`, but BullMQ
 * applies its limiter at the queue level (one queue per provider in this
 * codebase — see `packages/infrastructure/src/queue/bullmq-job-scheduler.ts`).
 * To stay below every endpoint's quota under any mix of jobs, we pick the
 * MOST RESTRICTIVE policy across all endpoints (highest `durationMs / max`,
 * i.e. the lowest tokens-per-second).
 *
 * Why min-effective-rate vs per-endpoint queues: BullMQ's repeatable jobs
 * + the existing scheduler model `(provider, definition) -> queue:provider`.
 * Splitting by `(provider, endpoint)` would multiply queues 3× without
 * unblocking anything operationally useful — the same Redis connection
 * still applies the limiter per name, and our run-now / cron mixing puts
 * different endpoints under the same parent queue anyway. The conservative
 * floor here is correct: PageSpeed declares 1/1s and we DO need to honour
 * that; DataForSEO declares 2000/min on every endpoint so the floor is the
 * same as picking any endpoint.
 *
 * Returns `null` when the manifest has zero endpoints (a degenerate case the
 * type system permits but the registry never produces). Callers that get
 * `null` should not configure a limiter at all (default: unlimited).
 */
export const effectiveQueueRateLimit = (
	manifest: ProviderManifest,
): { max: number; duration: number } | null => {
	if (manifest.endpoints.length === 0) return null;
	let chosen: { max: number; duration: number } | null = null;
	for (const ep of manifest.endpoints) {
		const candidate = { max: ep.descriptor.rateLimit.max, duration: ep.descriptor.rateLimit.durationMs };
		if (chosen === null) {
			chosen = candidate;
			continue;
		}
		// Compare tokens-per-millisecond. The smaller rate wins (most restrictive).
		const chosenRate = chosen.max / chosen.duration;
		const candidateRate = candidate.max / candidate.duration;
		if (candidateRate < chosenRate) {
			chosen = candidate;
		}
	}
	return chosen;
};
