import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { extractRows } from './acl/run-report-to-rows.acl.js';
import { parseServiceAccount } from './credential.js';
import {
	fetchRunReport,
	type RunReportParams,
	type RunReportResponse,
	runReportDescriptor,
} from './endpoints/run-report.js';
import { buildLegacyShim, Ga4HttpClient } from './http.js';

/**
 * Google Analytics 4 manifest. Uses the `service-account-jwt` AuthStrategy
 * because the upstream requires a signed JWT exchanged for a short-lived
 * OAuth access token before each call.
 *
 * `BaseHttpClient.applyAuth` is synchronous and cannot do that exchange,
 * so `Ga4HttpClient` overrides `request` instead — see the comment at the
 * top of `./http.ts`.
 *
 * The ingest binding key `traffic-analytics:ingest-ga4-rows` matches the
 * worker's existing dispatch (apps/worker/src/processors/
 * provider-fetch.processor.ts ~line 575) so when Phase 5 activates the
 * IngestRouter the call routes to the same use case the OLD if-else does.
 *
 * `ga4PropertyId` lives in `ctx.systemParams` because it's stamped by the
 * LinkGa4Property Auto-Schedule handler at scheduling time (ADR 0001), not
 * supplied per-call by the operator. The endpoint params (startDate,
 * endDate) come from `ctx.endpointParams` because they're part of the
 * JobDefinition shape and influence the ACL fallback date.
 */
const auth: AuthStrategy = { kind: 'service-account-jwt' };

/**
 * Adapts the existing `fetchRunReport(http: Ga4Http, ...)` helper to the
 * manifest's `(http: HttpClient, params, ctx) => Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse, but the helper
 * still expects `Ga4Http.post`'s 4-arg shape. The shim preserves that
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
		// IngestRouter constructs ONE `Ga4HttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as Ga4HttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Bridges `extractRows` (which needs the request's `startDate / endDate`
 * to derive the fallback `observedDate` when `date` isn't a requested
 * dimension) to the IngestRouter's `(response, ctx) => unknown[]` ACL
 * contract. Unlike GSC's ACL, the GA4 ACL reads dimensions directly from
 * `response.dimensionHeaders` — only the date window comes from params.
 */
const extractRowsForRouter = (response: RunReportResponse, ctx: AclContext): unknown[] => {
	const params = ctx.endpointParams as Pick<RunReportParams, 'startDate' | 'endDate'>;
	return extractRows(response, {
		startDate: params.startDate,
		endDate: params.endDate,
	});
};

const trafficAnalyticsIngest: IngestBinding<RunReportResponse> = {
	useCaseKey: 'traffic-analytics:ingest-ga4-rows',
	systemParamKey: 'ga4PropertyId',
	acl: extractRowsForRouter,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: runReportDescriptor,
		fetch: adapt(fetchRunReport),
		ingest: trafficAnalyticsIngest as IngestBinding,
	},
];

export const ga4ProviderManifest: ProviderManifest = {
	id: 'google-analytics-4',
	displayName: 'Google Analytics 4',
	http: {
		baseUrl: 'https://analyticsdata.googleapis.com',
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
	buildHttpClient: (http) => new Ga4HttpClient(http),
};
