import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { extractGscRows } from './acl/search-analytics-to-observations.acl.js';
import { parseServiceAccount } from './credential.js';
import {
	fetchSearchAnalytics,
	type SearchAnalyticsParams,
	type SearchAnalyticsResponse,
	searchAnalyticsDescriptor,
} from './endpoints/search-analytics.js';
import { buildLegacyShim, type GoogleSearchConsoleHttpClient } from './http.js';

/**
 * Google Search Console manifest. Uses the `service-account-jwt`
 * AuthStrategy because the upstream requires a signed JWT exchanged for
 * a short-lived OAuth access token before each call.
 *
 * `BaseHttpClient.applyAuth` is synchronous and cannot do that exchange,
 * so `GoogleSearchConsoleHttpClient` overrides `request` instead — see the
 * comment at the top of `./http.ts`.
 *
 * The ingest binding key `search-console-insights:ingest-gsc-rows` matches
 * the worker's existing dispatch (apps/worker/src/processors/
 * provider-fetch.processor.ts ~line 485) so when Phase 5 activates the
 * IngestRouter the call routes to the same use case the OLD if-else does.
 *
 * `gscPropertyId` lives in `ctx.systemParams` because it's stamped by the
 * LinkGscProperty Auto-Schedule handler at scheduling time (ADR 0001), not
 * supplied per-call by the operator. The endpoint params (dimensions,
 * startDate, endDate) come from `ctx.endpointParams` because they're part
 * of the JobDefinition shape and influence the ACL row shape.
 */
const auth: AuthStrategy = { kind: 'service-account-jwt' };

/**
 * Adapts the existing `fetchSearchAnalytics(http: GscHttp, ...)` helper to
 * the manifest's `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse, but the helper
 * still expects `GscHttp.post`'s 4-arg shape. The shim preserves that
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
			http: ReturnType<typeof buildLegacyShim>,
			params: TParams,
			ctx: Parameters<typeof buildLegacyShim>[1],
		) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `GoogleSearchConsoleHttpClient` per
		// provider at composition time and reuses it across all endpoint
		// fetches; the runtime cast here is safe because the manifest's HTTP
		// config and the registered client are siblings produced from the
		// same factory.
		const shim = buildLegacyShim(http as GoogleSearchConsoleHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Bridges `extractGscRows` (which needs the request's `dimensions /
 * startDate / endDate` to project the response rows) to the IngestRouter's
 * `(response, ctx) => unknown[]` ACL contract. The endpoint params land in
 * `ctx.endpointParams` because they're part of the persisted JobDefinition
 * — defaulting `dimensions` to `['date']` mirrors `SearchAnalyticsParams`'
 * zod default so a JobDefinition stored before the field existed still
 * produces sensible row buckets.
 */
const extractGscRowsForRouter = (response: SearchAnalyticsResponse, ctx: AclContext): unknown[] => {
	const params = ctx.endpointParams as Pick<SearchAnalyticsParams, 'dimensions' | 'startDate' | 'endDate'>;
	return extractGscRows(response, {
		dimensions: params.dimensions ?? ['date'],
		startDate: params.startDate,
		endDate: params.endDate,
	});
};

const searchConsoleIngest: IngestBinding<SearchAnalyticsResponse> = {
	useCaseKey: 'search-console-insights:ingest-gsc-rows',
	systemParamKey: 'gscPropertyId',
	acl: extractGscRowsForRouter,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: searchAnalyticsDescriptor,
		fetch: adapt(fetchSearchAnalytics),
		ingest: searchConsoleIngest as IngestBinding,
	},
];

export const googleSearchConsoleProviderManifest: ProviderManifest = {
	id: 'google-search-console',
	displayName: 'Google Search Console',
	http: {
		baseUrl: 'https://searchconsole.googleapis.com',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `parseServiceAccount` throws InvalidInputError on the wrong shape
		// (must be a Service Account JSON blob with client_email and
		// private_key). Re-thrown as-is so RegisterProviderCredentialUseCase
		// surfaces a 400 at registration.
		parseServiceAccount(plaintextSecret);
	},
	endpoints,
};
