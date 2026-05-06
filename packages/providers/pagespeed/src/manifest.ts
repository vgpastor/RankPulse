import type {
	AclContext,
	AuthStrategy,
	EndpointManifest,
	FetchContext,
	IngestBinding,
	ProviderManifest,
} from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { extractSnapshot } from './acl/psi-to-snapshot.acl.js';
import {
	fetchRunPagespeed,
	type RunPagespeedParams,
	type RunPagespeedResponse,
	runPagespeedDescriptor,
} from './endpoints/runpagespeed.js';
import { buildLegacyShim, type PageSpeedAuth, type PageSpeedHttp, PageSpeedHttpClient } from './http.js';

/**
 * Google PageSpeed Insights manifest.
 *
 * - Why `auth.kind = 'api-key-or-service-account-jwt'`: PSI's
 *   `plaintextSecret` is polymorphic — EITHER a Service Account JSON blob
 *   (mint OAuth2 Bearer token via `google-auth-library`) OR a bare API key
 *   (append `?key=<key>` to the URL). The same registered credential can
 *   be either shape; the right transport is picked at request time based
 *   on the credential's first character.
 * - Why `PageSpeedHttpClient.request` is overridden: the default
 *   `BaseHttpClient.applyAuth` THROWS for `kind:
 *   'api-key-or-service-account-jwt'` because the SA-JSON branch needs an
 *   async JWT mint, which the sync `applyAuth` signature can't do. The
 *   override handles both branches inline — see `./http.ts` header.
 * - Why `validateCredentialPlaintext` is duplicated from the legacy
 *   `PageSpeedProvider`: Phase 7 deletes that class. To avoid the manifest
 *   transitively depending on a class slated for removal, the dual-shape
 *   format check is inlined here. The check stays equivalent: trim, branch
 *   on leading `{`, parse-or-throw with the same `InvalidInputError`
 *   messages so registration-time errors are unchanged.
 * - Why the ACL wraps the single snapshot in an array: PSI returns ONE
 *   payload per URL run — `extractSnapshot()` reduces it to a single
 *   `PageSpeedSnapshotExtraction` row stamped at `analysisUTCTimestamp`
 *   (or `ctx.dateBucket`'s midnight UTC if missing). `IngestBinding.acl`
 *   returns `unknown[]`, so we wrap the single snapshot — the use case
 *   ingests one row per execution.
 * - Why the legacy shim ignores its `auth` argument: the legacy
 *   `fetchRunPagespeed(http, params, auth, ctx)` takes `auth` because
 *   the OLD `PageSpeedProvider` resolved it before the call. The new
 *   `PageSpeedHttpClient.request` resolves auth from
 *   `ctx.credential.plaintextSecret` itself, so the `auth` parameter is
 *   redundant on the manifest path. The shim threads a sentinel auth
 *   value through the legacy fetcher to satisfy its signature; the real
 *   client ignores it.
 *
 * The ingest binding key matches the worker's existing dispatch
 * (apps/worker/src/processors/provider-fetch.processor.ts:405-435) so
 * when Phase 5 activates the IngestRouter the call routes to the same use
 * case the OLD if-else does.
 *
 * `trackedPageId` lives in `ctx.systemParams` because it's stamped by the
 * Auto-Schedule handler at scheduling time (ADR 0001), not supplied
 * per-call by the operator.
 */
const auth: AuthStrategy = { kind: 'api-key-or-service-account-jwt' };

/**
 * Adapts the existing `fetchRunPagespeed(http: PageSpeedHttp, params,
 * auth, ctx)` helper to the manifest's `(http: HttpClient, params, ctx) =>
 * Promise<R>` signature.
 *
 * `BaseHttpClient` already owns auth + signal + JSON parse + body cap, but
 * the helper still expects `PageSpeedHttp.get`'s 4-arg shape (including
 * `auth`). The shim preserves that signature until Phase 5 inlines the
 * helper into the manifest fetch closure, and the sentinel `auth` below
 * satisfies the helper's type — the real `PageSpeedHttpClient` resolves
 * auth from `ctx.credential` and the shim discards the sentinel.
 *
 * `params` arrives typed as `unknown` from the IngestRouter (which only
 * trusts what zod validated upstream). The cast is safe because the worker
 * validates `definition.params` against `descriptor.paramsSchema` BEFORE
 * invoking `fetch`. A malformed payload would have failed before reaching
 * here.
 */
const SENTINEL_AUTH: PageSpeedAuth = { kind: 'apiKey', apiKey: '' };

const adapt =
	<TParams, TResponse>(
		helper: (
			http: PageSpeedHttp,
			params: TParams,
			auth: PageSpeedAuth,
			ctx: FetchContext,
		) => Promise<TResponse>,
	): EndpointManifest<unknown, unknown>['fetch'] =>
	async (http, params, ctx) => {
		// IngestRouter constructs ONE `PageSpeedHttpClient` per provider at
		// composition time and reuses it across all endpoint fetches; the
		// runtime cast here is safe because the manifest's HTTP config and
		// the registered client are siblings produced from the same factory.
		const shim = buildLegacyShim(http as PageSpeedHttpClient, ctx);
		return helper(shim, params as TParams, SENTINEL_AUTH, ctx);
	};

/**
 * PSI returns a single payload per URL run; `extractSnapshot()` reduces
 * that to one `PageSpeedSnapshotExtraction` row. `IngestBinding.acl`
 * returns `unknown[]`, so we wrap the single snapshot — the use case
 * ingests one row per execution.
 *
 * `dateBucket` arrives as `YYYY-MM-DD` from the IngestRouter (the cron's
 * wall-clock day, supplied at dispatch time). We feed midnight UTC of
 * that day as the fallback to `extractSnapshot` for cases where the
 * upstream omits `analysisUTCTimestamp`.
 */
const psiAcl = (response: RunPagespeedResponse, ctx: AclContext): unknown[] => {
	const snap = extractSnapshot(response, new Date(`${ctx.dateBucket}T00:00:00Z`));
	return [snap];
};

const webPerformanceIngest: IngestBinding<RunPagespeedResponse> = {
	useCaseKey: 'web-performance:record-pagespeed-snapshot',
	systemParamKey: 'trackedPageId',
	acl: psiAcl,
};

const endpoints: readonly EndpointManifest[] = [
	{
		descriptor: runPagespeedDescriptor,
		fetch: adapt<RunPagespeedParams, RunPagespeedResponse>(fetchRunPagespeed),
		ingest: webPerformanceIngest as IngestBinding,
	},
];

export const pagespeedProviderManifest: ProviderManifest = {
	id: 'pagespeed',
	displayName: 'Google PageSpeed Insights',
	http: {
		baseUrl: 'https://www.googleapis.com',
		auth,
		defaultTimeoutMs: 60_000,
	},
	validateCredentialPlaintext(plaintextSecret: string): void {
		// Inlined dual-shape validator (mirrors the legacy
		// `PageSpeedProvider.validateCredentialPlaintext` body verbatim, by
		// design — Phase 7 deletes the class and the manifest must stand on
		// its own at that point).
		const trimmed = plaintextSecret.trim();
		if (trimmed.startsWith('{')) {
			try {
				const parsed = JSON.parse(trimmed) as { client_email?: unknown; private_key?: unknown };
				if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
					throw new InvalidInputError(
						'PageSpeed credential JSON must be a Google Service Account with client_email + private_key',
					);
				}
			} catch (err) {
				if (err instanceof InvalidInputError) throw err;
				throw new InvalidInputError(
					'PageSpeed credential JSON must be a Google Service Account with client_email + private_key',
				);
			}
			return;
		}
		if (!/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
			throw new InvalidInputError(
				'PageSpeed credential must be either a Service Account JSON or an API key (>=20 chars of [A-Za-z0-9_-])',
			);
		}
	},
	endpoints,
	// PSI's free tier exhausts as either 402 or 429 (rate limit / quota
	// over). Auto-pause until the next budget window.
	isQuotaExhausted(error: unknown): boolean {
		return error instanceof ProviderApiError && (error.status === 402 || error.status === 429);
	},
	buildHttpClient: (http) => new PageSpeedHttpClient(http),
};
