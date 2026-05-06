import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { extractSnapshot } from './acl/domain-rank-to-snapshot.acl.js';
import { validateCloudflareToken } from './credential.js';
import {
	type DomainRankParams,
	type DomainRankResponse,
	domainRankDescriptor,
	fetchDomainRank,
} from './endpoints/domain-rank.js';
import { buildLegacyShim, type CloudflareRadarHttp, type CloudflareRadarHttpClient } from './http.js';

/**
 * Cloudflare Radar manifest.
 *
 * - Why `auth.kind = 'bearer-token'`: Cloudflare Radar accepts an API
 *   token (with the `Radar:Read` scope) sent as
 *   `Authorization: Bearer <token>`. The default
 *   `BaseHttpClient.applyAuth` for this kind already produces exactly
 *   that header, so the manifest needs zero auth-specific overrides.
 * - Why `CloudflareRadarHttpClient.request` is overridden anyway: see
 *   `./http.ts` header. The override exists ONLY to enforce Cloudflare
 *   Radar's 8MB response body cap (Content-Length pre-flight + post-read
 *   guard). The auth header itself is re-used from the parent via
 *   `super.applyAuth(...)` — no duplication.
 * - Why the ACL wraps the single snapshot in an array: Cloudflare Radar
 *   returns ONE snapshot per call (the current rank for the requested
 *   domain — `meta.lastUpdated` carries the data freshness date).
 *   `extractSnapshot()` returns a single `DomainRankSnapshot` object;
 *   the manifest's `IngestBinding.acl` contract returns `unknown[]`, so
 *   we wrap the single result in an array. The use case ingests one
 *   snapshot row per execution.
 * - Why we bridge `dateBucket: string` → `Date` for the ACL: the legacy
 *   ACL signature is `extractSnapshot(response, fallbackToday: Date)`,
 *   which the worker currently feeds with `clock.now()`. The
 *   IngestRouter exposes `AclContext.dateBucket` as a YYYY-MM-DD string,
 *   so we parse it explicitly via `new Date('${dateBucket}T00:00:00Z')`.
 *   Modern engines parse YYYY-MM-DD as midnight UTC, but the explicit
 *   `T00:00:00Z` removes any TZ ambiguity and locks the fallback to
 *   the cron's wall-clock day. Note: in practice the ACL prefers
 *   `meta.lastUpdated` from the response itself and only falls back to
 *   this Date when Cloudflare omits it.
 * - Why `isQuotaExhausted` is overridden: Cloudflare Radar's free tier
 *   limits both per-request budget (402 once exhausted) AND the
 *   per-account 1.2k req/5min ceiling (429). The default
 *   `isQuotaExhaustedError` (`core/src/error.ts`) does cover both
 *   statuses today, but stating the per-provider semantics explicitly
 *   here makes Cloudflare Radar's contract self-documenting and
 *   isolates this provider from any future tightening of the default
 *   detector.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts:526-549) so
 * when Phase 5 activates the IngestRouter the call routes to the same
 * use case the OLD if-else does.
 *
 * `monitoredDomainId` lives in `ctx.systemParams` because it's stamped
 * by the AddMonitoredDomain Auto-Schedule handler at scheduling time
 * (ADR 0001), not supplied per-call by the operator.
 */
const auth: AuthStrategy = { kind: 'bearer-token' };

/**
 * Adapts the existing `fetchDomainRank(http: CloudflareRadarHttp, ...)`
 * helper to the manifest's `(http: HttpClient, params, ctx) => Promise<R>`
 * signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helper still expects `CloudflareRadarHttp.get`'s 4-arg shape.
 * The shim preserves that signature until Phase 5 inlines the helper
 * into the manifest fetch closure.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the
 * worker validates `definition.params` against `descriptor.paramsSchema`
 * BEFORE invoking `fetch`. A malformed payload would have failed before
 * reaching here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (http: CloudflareRadarHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `CloudflareRadarHttpClient` per provider
		// at composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as CloudflareRadarHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Cloudflare Radar returns ONE snapshot per call (current rank +
 * categories + bucket for the requested domain), NOT a per-day series.
 * `extractSnapshot()` reduces that response to a single
 * `DomainRankSnapshot` row — preferring the response's own
 * `meta.lastUpdated` and falling back to the supplied `Date` when
 * Cloudflare omits it. The IngestRouter passes `dateBucket` as a
 * YYYY-MM-DD string (the cron's wall-clock day); we normalise it to
 * a UTC midnight `Date` so the legacy ACL signature stays unchanged.
 * `IngestBinding.acl` returns `unknown[]`, so we wrap the single
 * snapshot in an array — the use case ingests one row per execution.
 */
const domainRankAcl = (response: DomainRankResponse, ctx: AclContext): unknown[] => {
	const snap = extractSnapshot(response, new Date(`${ctx.dateBucket}T00:00:00Z`));
	return [snap];
};

const macroContextIngest: IngestBinding<DomainRankResponse> = {
	useCaseKey: 'macro-context:record-radar-rank',
	systemParamKey: 'monitoredDomainId',
	acl: domainRankAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: domainRankDescriptor,
		// `fetchDomainRank` accepts the legacy `CloudflareRadarHttp` shape;
		// the adapter wires it through `buildLegacyShim` over the new
		// `CloudflareRadarHttpClient`.
		fetch: adapt<DomainRankParams, DomainRankResponse>(fetchDomainRank),
		ingest: macroContextIngest as IngestBinding,
	},
];

export const cloudflareRadarProviderManifest: ProviderManifest = {
	id: 'cloudflare-radar',
	displayName: 'Cloudflare Radar',
	http: {
		baseUrl: 'https://api.cloudflare.com/client/v4',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `validateCloudflareToken` throws InvalidInputError on the wrong
		// shape (must be 20+ chars from a JWT-friendly charset). Re-thrown
		// as-is so RegisterProviderCredentialUseCase surfaces a 400 at
		// registration.
		validateCloudflareToken(plaintextSecret);
	},
	endpoints,
	// Cloudflare Radar's free tier exhausts as either 402 (per-request
	// budget spent) or 429 (per-account 1.2k/5min ceiling) depending on
	// which limit trips first; auto-pause the JobDefinition until the
	// next budget window.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
};
