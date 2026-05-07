import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { extractSnapshot } from './acl/data-export-to-snapshot.acl.js';
import { validateClarityToken } from './credential.js';
import {
	type DataExportParams,
	type DataExportResponse,
	dataExportDescriptor,
	fetchDataExport,
} from './endpoints/data-export.js';
import { buildLegacyShim, type ClarityHttp, ClarityHttpClient } from './http.js';

/**
 * Microsoft Clarity Data Export manifest.
 *
 * - Why `auth.kind = 'bearer-token'`: Clarity's auth model is the
 *   simplest possible — `Authorization: Bearer <token>`. The default
 *   `BaseHttpClient.applyAuth` for this kind already produces exactly
 *   that header, so the manifest needs zero auth-specific overrides.
 * - Why no `ClarityHttpClient.request` override: Clarity's 8MB response
 *   body cap moved to `manifest.http.maxResponseBytes` and is enforced
 *   by `BaseHttpClient.parseResponse` (Content-Length pre-flight +
 *   post-read guard). No subclass override is needed for the body cap.
 * - Why the ACL wraps the single snapshot in an array: Clarity returns
 *   aggregated metrics over the requested `numOfDays` window — i.e. ONE
 *   snapshot, not a per-day series. `extractSnapshot()` returns a single
 *   `ClarityMetricsSnapshot` object; the manifest's `IngestBinding.acl`
 *   contract returns `unknown[]`, so we wrap the single result in an
 *   array. The use case ingests one snapshot row per execution.
 * - Why `observedDate` comes from `AclContext.dateBucket`: the legacy
 *   worker path stamps `clock.now().toISOString().slice(0,10)` as the
 *   observed date (the cron's wall-clock day). The IngestRouter's
 *   `AclContext.dateBucket` carries that same value, set by the router
 *   at dispatch time, so the migrated path is behavior-equivalent.
 * - Why `isQuotaExhausted` is overridden: Clarity's free tier (10
 *   req/day per project) exhausts as either HTTP 402 OR HTTP 429
 *   depending on which limit trips first. The default
 *   `isQuotaExhaustedError` (`core/src/error.ts`) does cover both
 *   statuses today, but stating the per-provider semantics explicitly
 *   here makes Clarity's contract self-documenting and isolates this
 *   provider from any future tightening of the default detector.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts:492-524) so
 * when Phase 5 activates the IngestRouter the call routes to the same
 * use case the OLD if-else does.
 *
 * `clarityProjectId` lives in `ctx.systemParams` because it's stamped
 * by the LinkClarityProject Auto-Schedule handler at scheduling time
 * (ADR 0001), not supplied per-call by the operator.
 */
const auth: AuthStrategy = { kind: 'bearer-token' };

/**
 * Adapts the existing `fetchDataExport(http: ClarityHttp, ...)` helper
 * to the manifest's `(http: HttpClient, params, ctx) => Promise<R>`
 * signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap,
 * but the helper still expects `ClarityHttp.get`'s 4-arg shape. The
 * shim preserves that signature until Phase 5 inlines the helper into
 * the manifest fetch closure.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the
 * worker validates `definition.params` against `descriptor.paramsSchema`
 * BEFORE invoking `fetch`. A malformed payload would have failed before
 * reaching here.
 */
const adapt =
	<TParams, TResponse>(
		helper: (http: ClarityHttp, params: TParams, ctx: FetchContext) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `ClarityHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as ClarityHttpClient, ctx);
		return helper(shim, params as TParams, ctx);
	};

/**
 * Clarity returns aggregated metrics over the requested window, NOT a
 * per-day series. `extractSnapshot()` reduces that response to a single
 * `ClarityMetricsSnapshot` row stamped with `ctx.dateBucket` (the cron's
 * wall-clock day, supplied by the IngestRouter). `IngestBinding.acl`
 * returns `unknown[]`, so we wrap the single snapshot in an array — the
 * use case ingests one row per execution.
 */
const dataExportAcl = (response: DataExportResponse, ctx: AclContext): unknown[] => {
	const snap = extractSnapshot(response, ctx.dateBucket);
	return [snap];
};

const experienceAnalyticsIngest: IngestBinding<DataExportResponse> = {
	useCaseKey: 'experience-analytics:record-experience-snapshot',
	systemParamKey: 'clarityProjectId',
	acl: dataExportAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: dataExportDescriptor,
		// `fetchDataExport` accepts the legacy `ClarityHttp` shape; the
		// adapter wires it through `buildLegacyShim` over the new
		// `ClarityHttpClient`.
		fetch: adapt<DataExportParams, DataExportResponse>(fetchDataExport),
		ingest: experienceAnalyticsIngest as IngestBinding,
	},
];

export const microsoftClarityProviderManifest: ProviderManifest = {
	id: 'microsoft-clarity',
	displayName: 'Microsoft Clarity',
	http: {
		baseUrl: 'https://www.clarity.ms/export-data/api/v1',
		auth,
		defaultTimeoutMs: 60_000,
		// Clarity `/project-live-insights` payloads are usually small, but
		// a misconfigured project with many dimensions can produce
		// surprisingly large responses; 8MB is a generous safety net.
		// Enforced by `BaseHttpClient.parseResponse`.
		maxResponseBytes: 8 * 1024 * 1024,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// `validateClarityToken` throws InvalidInputError on the wrong
		// shape (must be 20+ chars from a JWT-friendly charset). Re-thrown
		// as-is so RegisterProviderCredentialUseCase surfaces a 400 at
		// registration.
		validateClarityToken(plaintextSecret);
	},
	endpoints,
	// Clarity's free tier exhausts as either 402 or 429 depending on which
	// limit trips first; auto-pause the JobDefinition until the next day's
	// budget window.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
	buildHttpClient: (http) => new ClarityHttpClient(http),
};
