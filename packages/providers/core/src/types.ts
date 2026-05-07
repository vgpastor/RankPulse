import type { ZodTypeAny } from 'zod';

// The legacy string-union `AuthStrategy` ('apiKey' | 'basic' | 'oauth2' |
// 'serviceAccount') and the `Provider` class interface have been deleted in
// Phase 7b of ADR 0002. The replacement — `AuthStrategy` discriminated union
// + `ProviderManifest` — lives in `./manifest.ts`.

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
	 * Optional dynamic cost calculator. The worker calls this once it has
	 * both the resolved params AND the parsed upstream response, so two
	 * billing models are supported:
	 *
	 * - **Params-driven**: endpoints whose cost is fully predictable from
	 *   the request shape. Example: DataForSEO search-volume bills
	 *   per-keyword and the keyword count is in the params, so the
	 *   descriptor only inspects `params` and ignores `response`.
	 *
	 * - **Response-driven**: endpoints whose cost depends on what the
	 *   upstream actually returned (token usage, web_search count, page
	 *   characters consumed, …). Example: OpenAI/Anthropic AI Brand Radar
	 *   bill per token + per web_search call; the descriptor delegates to
	 *   the provider's ACL helper to derive the real figure from the raw
	 *   payload.
	 *
	 * If absent, the worker falls back to `cost.amount` (worst-case).
	 *
	 * Implementations MUST be defensive: a thrown error causes the worker
	 * to bill worst-case for that run AND log a warning, so a malformed
	 * upstream payload won't break ingest.
	 */
	readonly costFor?: (params: unknown, response: unknown) => number;
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

// Legacy `Provider` class interface removed (ADR 0002 Phase 7b). All 14
// `XProvider` classes — DataForSeoProvider, GscProvider, … — have been
// deleted; manifest-driven `ProviderManifest` + `ManifestProviderRegistry`
// (see `./manifest.ts` + `./manifest-registry.ts`) replace the runtime
// surface.
