import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	HttpRequest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { extractAdsInsightRows } from './acl/ads-insights-to-rows.acl.js';
import { extractPixelEventRows } from './acl/pixel-events-to-rows.acl.js';
import { validateMetaAccessToken } from './credential.js';
import {
	type AdsInsightsParams,
	type AdsInsightsResponse,
	adsInsightsDescriptor,
	fetchAdsInsights,
} from './endpoints/ads-insights.js';
import {
	type CustomAudiencesParams,
	type CustomAudiencesResponse,
	customAudiencesDescriptor,
	fetchCustomAudiences,
} from './endpoints/custom-audiences.js';
import {
	fetchPixelEventsStats,
	type PixelEventsStatsParams,
	type PixelEventsStatsResponse,
	pixelEventsStatsDescriptor,
} from './endpoints/pixel-events-stats.js';
import { buildLegacyShim, type MetaHttp, MetaHttpClient } from './http.js';

/**
 * Meta (Facebook) Graph / Marketing API manifest.
 *
 * - Why `auth.kind = 'custom'`: Meta's auth model is a single long-lived
 *   access token appended to the URL as `?access_token=<token>`, NOT a
 *   header. While Meta also accepts `Authorization: Bearer <token>`, the
 *   BUC rate limiter and FB's own examples key off the query-param form,
 *   so we mirror that. Neither `'api-key-header'` nor `'basic'` fits, so
 *   we declare a `'custom'` strategy with a `sign(req, secret)` function.
 *   The function is exported for future-compat — today
 *   `BaseHttpClient.applyAuth` throws for `'custom'` and does NOT dispatch
 *   to `sign`, so the actual token application happens inside
 *   `MetaHttpClient.request` (which we override). When the base client is
 *   upgraded to invoke `sign`, the override can be simplified.
 * - Why `MetaHttpClient.request` is overridden: see `./http.ts` header.
 *   The default `applyAuth` for `'custom'` throws; the override mirrors
 *   the minimal request path and appends `access_token=<token>` to the
 *   URL itself.
 * - Why `baseUrl` already includes the API version (`/v21.0`): Meta pins
 *   API behaviour to a versioned path. The legacy `MetaHttp` class composes
 *   `${baseUrl}/${apiVersion}${path}`; in the manifest we collapse that
 *   into `baseUrl = https://graph.facebook.com/v21.0` so endpoint helpers
 *   can pass paths verbatim (e.g. `/act_12345/insights`) without each one
 *   re-prepending the version.
 * - Why TWO endpoints have IngestBindings (vs Bing's one): the worker
 *   currently auto-dispatches ingest for both `meta-ads-insights` (daily
 *   rows by `(account, day, level, entity_id)`, keyed by
 *   `metaAdAccountId`) and `meta-pixel-events-stats` (daily rows by
 *   `(pixel, day, event_name)`, keyed by `metaPixelId`).
 *   `meta-custom-audiences` is intentionally raw-only — Meta's
 *   `approximate_count_*` bands are too noisy to time-series, so the
 *   IngestRouter (Phase 5+) will simply persist the raw payload.
 * - Why `isQuotaExhausted` is overridden: Meta's BUC rate limiter signals
 *   quota exhaustion as either HTTP 402 (over-budget on a paid app) OR
 *   HTTP 429 (rate-limited on a free-tier account). The default
 *   `isQuotaExhaustedError` (`core/src/error.ts`) covers both today, but
 *   stating the per-provider semantics explicitly here makes Meta's
 *   contract self-documenting and isolates this provider from any future
 *   tightening of the default detector.
 *
 * The ingest binding keys match the worker's existing dispatches
 * (apps/worker/src/processors/provider-fetch.processor.ts ~lines 604-665)
 * so when Phase 5 activates the IngestRouter the calls route to the same
 * use cases the OLD if-else does.
 *
 * `metaAdAccountId` and `metaPixelId` live in `ctx.systemParams` because
 * they're stamped by the AutoScheduleOnMetaAdAccountLinkedHandler and
 * AutoScheduleOnMetaPixelLinkedHandler respectively at scheduling time
 * (ADR 0001), not supplied per-call by the operator.
 */
export const metaSignRequest = (req: HttpRequest, plaintextSecret: string): HttpRequest => {
	const token = validateMetaAccessToken(plaintextSecret);
	const sep = req.url.includes('?') ? '&' : '?';
	return { ...req, url: `${req.url}${sep}access_token=${encodeURIComponent(token)}` };
};

const auth: AuthStrategy = { kind: 'custom', sign: metaSignRequest };

/**
 * Adapts the existing `fetchAdsInsights(http: MetaHttp, ...)` /
 * `fetchCustomAudiences` / `fetchPixelEventsStats` helpers to the
 * manifest's `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helpers still expect `MetaHttp.get`'s 4-arg shape. The shim
 * preserves that signature until Phase 5 inlines the helpers into the
 * manifest fetch closures.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the
 * worker validates `definition.params` against `descriptor.paramsSchema`
 * BEFORE invoking `fetch`. A malformed payload would have failed before
 * reaching here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (http: MetaHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `MetaHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as MetaHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Ads Insights ACL bridge. The pure ACL `extractAdsInsightRows` takes the
 * response, the level, and a fallback date — pulled from
 * `ctx.endpointParams` (validated upstream by the descriptor's zod schema)
 * with a final fallback to `ctx.dateBucket` when `endDate` is missing or
 * malformed. Mirrors the worker's existing logic at
 * apps/worker/src/processors/provider-fetch.processor.ts:651-658.
 */
const adsInsightsAcl = (response: AdsInsightsResponse, ctx: AclContext): unknown[] => {
	const params = ctx.endpointParams as { level?: 'campaign' | 'adset' | 'ad' | 'account'; endDate?: string };
	const level = params.level ?? 'campaign';
	const fallbackDate =
		typeof params.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate)
			? params.endDate
			: ctx.dateBucket;
	return extractAdsInsightRows(response, level, fallbackDate);
};

/**
 * Pixel Events ACL bridge. The pure ACL `extractPixelEventRows` takes the
 * response and a fallback date — pulled from `ctx.endpointParams.endDate`
 * (validated upstream by the descriptor's zod schema) with a final
 * fallback to `ctx.dateBucket` when `endDate` is missing or malformed.
 * Mirrors the worker's existing logic at
 * apps/worker/src/processors/provider-fetch.processor.ts:623-627.
 */
const pixelEventsAcl = (response: PixelEventsStatsResponse, ctx: AclContext): unknown[] => {
	const params = ctx.endpointParams as { endDate?: string };
	const fallbackDate =
		typeof params.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate)
			? params.endDate
			: ctx.dateBucket;
	return extractPixelEventRows(response, fallbackDate);
};

const adsInsightsIngest: IngestBinding<AdsInsightsResponse> = {
	useCaseKey: 'meta-ads-attribution:ingest-meta-ads-insights',
	systemParamKey: 'metaAdAccountId',
	acl: adsInsightsAcl,
};

const pixelEventsIngest: IngestBinding<PixelEventsStatsResponse> = {
	useCaseKey: 'meta-ads-attribution:ingest-meta-pixel-events',
	systemParamKey: 'metaPixelId',
	acl: pixelEventsAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: pixelEventsStatsDescriptor,
		fetch: adapt<PixelEventsStatsParams, PixelEventsStatsResponse>(fetchPixelEventsStats),
		ingest: pixelEventsIngest as IngestBinding,
	},
	{
		descriptor: adsInsightsDescriptor,
		fetch: adapt<AdsInsightsParams, AdsInsightsResponse>(fetchAdsInsights),
		ingest: adsInsightsIngest as IngestBinding,
	},
	{
		descriptor: customAudiencesDescriptor,
		fetch: adapt<CustomAudiencesParams, CustomAudiencesResponse>(fetchCustomAudiences),
		// `meta-custom-audiences` is intentionally a raw-payload-only endpoint:
		// Meta's `approximate_count_*` bands are too noisy to time-series, so
		// the worker only persists the raw payload for inventory inspection.
		// The IngestRouter treats `ingest: null` as raw-only.
		ingest: null,
	},
];

export const metaProviderManifest: ProviderManifest = {
	id: 'meta',
	displayName: 'Meta (Facebook)',
	http: {
		// API version `/v21.0` is folded INTO baseUrl so endpoint paths can be
		// passed verbatim (e.g. `/act_12345/insights`) without each helper
		// re-prepending the version. See `./http.ts` header for the legacy
		// vs manifest URL composition contrast.
		baseUrl: 'https://graph.facebook.com/v21.0',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `validateMetaAccessToken` throws InvalidInputError on the wrong
		// shape (must be 40+ chars from FB's token charset). Re-thrown as-is
		// so RegisterProviderCredentialUseCase surfaces a 400 at registration.
		validateMetaAccessToken(plaintextSecret);
	},
	endpoints,
	// Meta's BUC rate limiter signals quota exhaustion as either 402
	// (over-budget on a paid app) or 429 (rate-limited on a free-tier
	// account); auto-pause the JobDefinition until the next budget window.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
	buildHttpClient: (http) => new MetaHttpClient(http),
};
