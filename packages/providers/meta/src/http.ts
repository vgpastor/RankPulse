/**
 * Meta Graph / Marketing API client. Auth = `access_token` query param
 * (Bearer header is also accepted but FB's own examples and the Business
 * Use Case rate limiter both look at the query-param form).
 *
 * The Marketing API is free under the Business Use Case (BUC) rate limit
 * (~200 calls/hour per app per ad account). We declare a tighter
 * 60 req/min in descriptors so a misconfigured cron can't drain it.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import {
	BaseHttpClient,
	type BaseHttpClientOptions,
	type HttpConfig,
	ProviderApiError,
} from '@rankpulse/provider-core';
import { validateMetaAccessToken } from './credential.js';

export interface MetaHttpOptions {
	baseUrl?: string;
	apiVersion?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'meta';

/**
 * Composes two AbortSignals so the request aborts when EITHER fires.
 * Caller-provided signal (job cancellation) + internal timeout signal.
 *
 * Duplicated from `BaseHttpClient` (where it's a private module-level helper)
 * because this client overrides `request` rather than `applyAuth`. See the
 * class header for the rationale.
 */
function composeSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
	const real = signals.filter((s): s is AbortSignal => Boolean(s));
	const [first, second] = real;
	if (first && !second) return first;
	const controller = new AbortController();
	for (const s of real) {
		if (s.aborted) {
			controller.abort();
			return controller.signal;
		}
		s.addEventListener('abort', () => controller.abort(), { once: true });
	}
	return controller.signal;
}

/**
 * BaseHttpClient adapter for the Meta Graph / Marketing API.
 *
 * The default `BaseHttpClient.applyAuth` throws for `kind: 'custom'`
 * strategies — it's a placeholder. Meta's auth model is a single
 * long-lived access token appended to the URL as `?access_token=<token>`,
 * NOT a header. While Meta also accepts `Authorization: Bearer <token>`,
 * the BUC rate limiter and FB's own examples key off the query-param
 * form, so we mirror that. Neither `'api-key-header'` nor `'basic'`
 * fits, so we declare a `'custom'` strategy with a `sign(req, secret)`
 * function. The function is exported for future-compat — today
 * `BaseHttpClient.applyAuth` does NOT dispatch to `sign` for custom
 * strategies, so the actual token application happens inside this
 * `request` override.
 *
 * The 8MB response body cap mirrors the legacy `MetaHttp` so a
 * misconfigured `/insights` query (e.g. `level=ad` with a fat date range)
 * can't OOM the worker.
 *
 * Used by the manifest path (Phase 5+). The legacy `MetaHttp` class below
 * preserves the existing `fetchAdsInsights(http: MetaHttp, ...)` /
 * `fetchCustomAudiences` / `fetchPixelEventsStats` signatures for the OLD
 * `MetaProvider`, which Phase 7 deletes.
 */
export class MetaHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig, options: BaseHttpClientOptions = {}) {
		super(PROVIDER_ID, config, options);
	}

	protected override async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		// Validate + trim the access token BEFORE any network call. A
		// malformed token surfaces as `InvalidInputError` from the provider
		// boundary so the worker treats it as a credential problem (no retry,
		// ask operator to re-link), not a transient upstream failure.
		const token = validateMetaAccessToken(ctx.credential.plaintextSecret);

		const baseUrl = this.buildUrl(path, query);
		const sep = baseUrl.includes('?') ? '&' : '?';
		const url = `${baseUrl}${sep}access_token=${encodeURIComponent(token)}`;

		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const headers: Record<string, string> = {
			Accept: 'application/json',
		};
		const init: RequestInit = { method, signal, headers };
		if (body !== undefined && (method === 'POST' || method === 'PUT')) {
			init.body = JSON.stringify(body);
			headers['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await (this.fetchImpl ?? globalThis.fetch)(url, init);
		} catch (err) {
			const message =
				err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
					? 'request aborted or timed out'
					: `network error: ${err instanceof Error ? err.message : String(err)}`;
			throw new ProviderApiError(PROVIDER_ID, 0, undefined, message);
		}

		// Best-effort early kill: if the upstream advertises Content-Length
		// over the cap, refuse before draining the body. Some responses are
		// chunked, in which case we fall back to the post-read guard below.
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Meta ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Meta ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`${PROVIDER_ID} ${method} ${path} → ${response.status}`,
			);
		}

		if (text.length === 0) return undefined as unknown as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`${PROVIDER_ID} ${method} ${path} → ${response.status} non-JSON body`,
			);
		}
	}
}

/**
 * Legacy GET wrapper used by the existing `fetchAdsInsights` /
 * `fetchCustomAudiences` / `fetchPixelEventsStats` helpers and the
 * `MetaProvider` class (deleted in Phase 7). Retained verbatim so the OLD
 * code path continues to work alongside the NEW manifest path.
 */
export class MetaHttp {
	private readonly baseUrl: string;
	private readonly apiVersion: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: MetaHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const token = validateMetaAccessToken(plaintextCredential);
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		params.set('access_token', token);
		const url = `${this.baseUrl}/${this.apiVersion}${path}?${params.toString()}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Meta ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Meta ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`Meta ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Backward-compat alias. The old per-provider `MetaApiError` class is gone;
 * consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:143` does an
 * `instanceof MetaApiError && (status === 402 || status === 429)` check)
 * still import this name, so we re-export `ProviderApiError` under it.
 * This preserves the `instanceof` check for both legacy AND new code paths
 * — `ProviderApiError` thrown by `MetaHttpClient` will also satisfy
 * `instanceof MetaApiError`. Phases 5/6 retire the worker code path;
 * Phase 7 can drop this alias when no callers remain.
 */
export const MetaApiError = ProviderApiError;
export type MetaApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchAdsInsights(http: MetaHttp, ...)` /
 * `fetchCustomAudiences` / `fetchPixelEventsStats` helpers call through
 * `MetaHttpClient` instead of `MetaHttp`. The manifest path uses this so a
 * single `BaseHttpClient` instance handles auth, timeouts and error
 * wrapping; the helpers keep their current signature.
 *
 * URL composition difference vs legacy:
 *  - Legacy `MetaHttp.get` builds `${baseUrl}/${apiVersion}${path}?...`
 *    where `baseUrl = https://graph.facebook.com` and `apiVersion = v21.0`.
 *  - Manifest `MetaHttpClient` reads `baseUrl =
 *    https://graph.facebook.com/v21.0` from `HttpConfig` (the API version
 *    is folded INTO the base URL), so the same `path` (e.g.
 *    `/act_12345/insights`) joins to the correct endpoint without needing
 *    the shim to re-prepend the version.
 *
 * The shim flattens multi-value queries (Meta endpoints currently use
 * single-value queries, but the legacy contract is `string | string[]`)
 * into the path's query string before calling `BaseHttpClient.get`, whose
 * `query: Record<string, string>` parameter cannot represent arrays. The
 * empty-object query passed to the base method keeps the URL builder a
 * no-op for the query string.
 *
 * `BaseHttpClient.get` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `MetaHttp.get`. Normalise so callers see the same shape regardless of
 * which path produced the value.
 */
export const buildLegacyShim = (client: MetaHttpClient, ctx: FetchContext): MetaHttp =>
	({
		get: async (
			path: string,
			query: Record<string, string | string[]>,
			_plaintextCredential: string,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			const params = new URLSearchParams();
			for (const [k, v] of Object.entries(query)) {
				if (Array.isArray(v)) for (const item of v) params.append(k, item);
				else params.append(k, v);
			}
			const fullPath = params.size > 0 ? `${path}?${params.toString()}` : path;
			const parsed = await client.get<unknown>(fullPath, {}, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as MetaHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
