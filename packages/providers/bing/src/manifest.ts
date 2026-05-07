import type {
	AuthStrategy,
	EndpointManifest,
	HttpRequest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { extractDailyRows } from './acl/rank-traffic-to-rows.acl.js';
import { validateBingApiKey } from './credential.js';
import { fetchQueryStats, queryStatsDescriptor } from './endpoints/query-stats.js';
import {
	fetchRankAndTrafficStats,
	type RankAndTrafficStatsResponse,
	rankAndTrafficStatsDescriptor,
} from './endpoints/rank-and-traffic-stats.js';
import { type BingHttp, BingHttpClient, buildLegacyShim } from './http.js';

/**
 * Bing Webmaster Tools manifest.
 *
 * - Why `auth.kind = 'custom'`: Bing's auth model is a single API key
 *   appended to the URL as `?apikey=<key>`, NOT a header. Neither
 *   `'api-key-header'` nor `'basic'` fits, so we declare a `'custom'`
 *   strategy with a `sign(req, secret)` function. The function is exported
 *   for future-compat — today `BaseHttpClient.applyAuth` throws for
 *   `'custom'` and does NOT dispatch to `sign`, so the actual key
 *   application happens inside `BingHttpClient.request` (which we override).
 *   When the base client is upgraded to invoke `sign`, the override can be
 *   simplified.
 * - Why `BingHttpClient.request` is overridden: see `./http.ts` header.
 *   The default `applyAuth` for `'custom'` throws; the override mirrors the
 *   minimal request path and appends `apikey=<key>` to the URL itself.
 * - Why only `bing-rank-and-traffic-stats` has an `IngestBinding`: the
 *   worker today auto-dispatches ingest for the daily traffic rows
 *   (`bing-webmaster-insights:ingest-bing-traffic`, keyed by
 *   `bingPropertyId`). `bing-query-stats` is raw-only ingest — no
 *   normalised fan-out is wired yet — so its `ingest` slot is `null` and
 *   the IngestRouter (Phase 5+) will simply persist the raw payload.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts ~line 568) so
 * when Phase 5 activates the IngestRouter the call routes to the same use
 * case the OLD if-else does.
 *
 * `bingPropertyId` lives in `ctx.systemParams` because it's stamped by the
 * LinkBingProperty Auto-Schedule handler at scheduling time (ADR 0001),
 * not supplied per-call by the operator.
 */
export const bingSignRequest = (req: HttpRequest, plaintextSecret: string): HttpRequest => {
	const apiKey = validateBingApiKey(plaintextSecret);
	const sep = req.url.includes('?') ? '&' : '?';
	return { ...req, url: `${req.url}${sep}apikey=${encodeURIComponent(apiKey)}` };
};

const auth: AuthStrategy = { kind: 'custom', sign: bingSignRequest };

/**
 * Adapts the existing `fetchRankAndTrafficStats(http: BingHttp, ...)` /
 * `fetchQueryStats(http: BingHttp, ...)` helpers to the manifest's
 * `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse, but the helper
 * still expects `BingHttp.get`'s 4-arg shape. The shim preserves that
 * signature until Phase 5 inlines the helper into the manifest fetch
 * closure.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the worker
 * validates `definition.params` against `descriptor.paramsSchema` BEFORE
 * invoking `fetch`. A malformed payload would have failed before reaching
 * here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (
			http: BingHttp,
			params: TParams,
			ctx: Parameters<typeof buildLegacyShim>[1],
		) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `BingHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as BingHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

const trafficIngest: IngestBinding<RankAndTrafficStatsResponse> = {
	useCaseKey: 'bing-webmaster-insights:ingest-bing-traffic',
	systemParamKey: 'bingPropertyId',
	// Bing's daily-rows ACL takes ONLY the response — no params, no context
	// needed (cleaner than GSC/GA4). The `ctx` argument is deliberately
	// ignored so the binding still satisfies `(response, ctx) => unknown[]`.
	acl: (response) => extractDailyRows(response),
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: rankAndTrafficStatsDescriptor,
		fetch: adapt(fetchRankAndTrafficStats),
		ingest: trafficIngest as IngestBinding,
	},
	{
		descriptor: queryStatsDescriptor,
		fetch: adapt(fetchQueryStats),
		// `bing-query-stats` has no auto-dispatch wired today — the worker
		// only persists the raw payload for query history. The IngestRouter
		// treats `ingest: null` as raw-only.
		ingest: null,
	},
];

export const bingProviderManifest: ProviderManifest = {
	id: 'bing-webmaster',
	displayName: 'Bing Webmaster Tools',
	http: {
		baseUrl: 'https://ssl.bing.com/webmaster/api.svc/json',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `validateBingApiKey` throws InvalidInputError on the wrong shape
		// (must be ≥20 alphanumeric characters). Re-thrown as-is so
		// RegisterProviderCredentialUseCase surfaces a 400 at registration.
		validateBingApiKey(plaintextSecret);
	},
	endpoints,
	buildHttpClient: (http) => new BingHttpClient(http),
};
