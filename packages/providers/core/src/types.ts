import type { ProviderConnectivity } from '@rankpulse/domain';
import type { ZodTypeAny } from 'zod';

export type AuthStrategy = 'apiKey' | 'basic' | 'oauth2' | 'serviceAccount';

export type EndpointCategory =
	| 'rankings'
	| 'keywords'
	| 'backlinks'
	| 'traffic'
	| 'onpage'
	| 'brand'
	| 'social';

/**
 * Static description of one endpoint a provider exposes. Drives the dynamic
 * UI for scheduling and the cost ledger; consumed by the registry to expose
 * `GET /providers/:id/endpoints`.
 */
export interface EndpointDescriptor {
	readonly id: string;
	readonly category: EndpointCategory;
	readonly displayName: string;
	readonly description: string;
	/**
	 * Zod schema used both at runtime (params validation) and to derive the
	 * OpenAPI body schema for the dynamic scheduling UI. Typed as `ZodTypeAny`
	 * so endpoints with `.default()` (different input/output types) compose.
	 */
	readonly paramsSchema: ZodTypeAny;
	readonly cost: { unit: 'usd_cents'; amount: number };
	/**
	 * Optional dynamic cost calculator. Endpoints that scale per item
	 * (e.g. DataForSEO search-volume bills per-keyword on a 1000-keyword
	 * batch) implement this so the api_usage ledger reflects the real
	 * upstream cost instead of the worst-case `cost.amount`.
	 *
	 * If absent, the worker falls back to `cost.amount`.
	 */
	readonly costFor?: (params: unknown) => number;
	/**
	 * BACKLOG #21 — DIRECTIVA: every endpoint MUST declare a default cron
	 * so the scheduling layer can auto-wire a JobDefinition without the
	 * caller having to pick one. The UI never live-fetches; the cron is
	 * what populates the read models the UI reads from.
	 */
	readonly defaultCron: string;
	readonly rateLimit: { max: number; durationMs: number };
}

export interface RateLimitPolicy {
	max: number;
	durationMs: number;
}

/**
 * Side-effects required during a fetch, injected by the worker. Keeping these
 * out of the provider implementation lets the provider itself stay pure and
 * testable with a stubbed context.
 */
export interface FetchContext {
	credential: { plaintextSecret: string };
	logger: { debug: (msg: string, meta?: object) => void; warn: (msg: string, meta?: object) => void };
	signal?: AbortSignal;
	now(): Date;
}

/**
 * Generic provider port. Adapters live in `packages/providers/<name>` and are
 * registered via {@link ProviderRegistry}. Provider-specific normalization
 * (ACL → domain observations) is NOT here; each functional bounded context
 * (rank-tracking, search-console-insights, ...) owns its own ACL that turns
 * a raw payload into its own aggregates.
 */
export interface Provider {
	readonly id: ProviderConnectivity.ProviderId;
	readonly displayName: string;
	readonly authStrategy: AuthStrategy;

	/** Static catalogue of endpoints this provider supports. */
	discover(): readonly EndpointDescriptor[];

	/**
	 * Validates that a plaintext secret is in the format this provider expects
	 * (e.g. DataForSEO `email|api_password`, GSC service account JSON). Called
	 * by RegisterProviderCredentialUseCase before encrypting + persisting, so
	 * misconfigured credentials surface as a 400 at registration time instead
	 * of as a worker job failure on the first run.
	 *
	 * Implementations throw `InvalidInputError` (or any `Error` subclass) on
	 * mismatch. Returning normally means the format is acceptable; it does NOT
	 * imply the credential is authorised by the upstream API.
	 */
	validateCredentialPlaintext(plaintextSecret: string): void;

	/**
	 * Performs the HTTP call and returns the raw response, exactly as the
	 * provider returned it. Persistence + dedup is the worker's responsibility.
	 */
	fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown>;
}
