/**
 * Bing Webmaster Tools API client. Auth = single API key as `apikey` query
 * parameter. The service base is `ssl.bing.com/webmaster/api.svc/json/`.
 *
 * Bing rate limit is undocumented but generous (Microsoft says "fair use");
 * empirically a few hundred req/min/account work. We declare a conservative
 * 60 req/min in the descriptor so a misconfigured cron can't burn the
 * account.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';
import { validateBingApiKey } from './credential.js';

export interface BingHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://ssl.bing.com/webmaster/api.svc/json';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'bing-webmaster';

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
 * BaseHttpClient adapter for Bing Webmaster Tools.
 *
 * The default `BaseHttpClient.applyAuth` throws for `kind: 'custom'` strategies
 * — it's a placeholder. Bing's auth model is a single API key appended to the
 * URL as `?apikey=<key>`, NOT a header, so neither `'api-key-header'` nor
 * `'basic'` fits. We override `request` here and append the key to the URL
 * ourselves; the manifest declares `auth: { kind: 'custom', sign }` for
 * future-compat (today `BaseHttpClient` does not dispatch to `sign`, so the
 * override below is what actually applies the key).
 *
 * Used by the manifest path (Phase 5+). The legacy `BingHttp` class below
 * preserves the existing `fetchRankAndTrafficStats(http: BingHttp, ...)` and
 * `fetchQueryStats` signatures for the OLD `BingProvider`, which Phase 7
 * deletes.
 */
export class BingHttpClient extends BaseHttpClient {
	private readonly fetchImpl: typeof fetch;

	constructor(config: HttpConfig, options: { fetchImpl?: typeof fetch } = {}) {
		super(PROVIDER_ID, config);
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	protected override async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		// Validate + trim the API key BEFORE any network call. A malformed key
		// surfaces as `InvalidInputError` from the provider boundary so the
		// worker treats it as a credential problem (no retry, ask operator
		// to re-link), not a transient upstream failure.
		const apiKey = validateBingApiKey(ctx.credential.plaintextSecret);

		const baseUrl = this.buildUrl(path, query);
		const sep = baseUrl.includes('?') ? '&' : '?';
		const url = `${baseUrl}${sep}apikey=${encodeURIComponent(apiKey)}`;

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
			response = await this.fetchImpl(url, init);
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
				`Bing ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Bing ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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
 * Legacy GET wrapper used by the existing `fetchRankAndTrafficStats` /
 * `fetchQueryStats` helpers and the `BingProvider` class (deleted in Phase 7).
 * Retained verbatim so the OLD code path continues to work alongside the NEW
 * manifest path.
 */
export class BingHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: BingHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async get(
		method: string,
		query: Record<string, string>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const apiKey = validateBingApiKey(plaintextCredential);
		const params = new URLSearchParams({ ...query, apikey: apiKey });
		const url = `${this.baseUrl}/${method}?${params.toString()}`;
		// Internal timeout protects worker concurrency slots even when the
		// caller forgot to pass a signal — without this a hung Bing request
		// (DNS, TCP, infinite redirect) blocks a slot indefinitely.
		const internalAbort = new AbortController();
		const timeoutHandle = setTimeout(() => internalAbort.abort(), this.timeoutMs);
		const composedSignal = composeSignals(signal, internalAbort.signal);
		try {
			const response = await this.fetchImpl(url, {
				method: 'GET',
				headers: { Accept: 'application/json' },
				signal: composedSignal,
			});
			const contentLength = response.headers.get('content-length');
			if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					undefined,
					`Bing ${method} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					undefined,
					`Bing ${method} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
					`Bing ${method} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

/**
 * Backward-compat alias. The old per-provider `BingApiError` class is gone;
 * consumers (worker processor's quota detector, package tests) still import
 * this name, so we re-export `ProviderApiError` under it. Phases 5/6 retire
 * the worker code path; Phase 7 can drop this alias when no callers remain.
 */
export const BingApiError = ProviderApiError;
export type BingApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchRankAndTrafficStats(http: BingHttp,
 * ...)` / `fetchQueryStats(http: BingHttp, ...)` helpers call through
 * `BingHttpClient` instead of `BingHttp`. The manifest path uses this so a
 * single `BaseHttpClient` instance handles auth, timeouts and error wrapping;
 * the helpers keep their current signature.
 *
 * The shim accepts the legacy 4-arg signature (`method, query, plaintext,
 * signal`) but ignores the last two parameters — `BaseHttpClient` reads the
 * credential from `ctx.credential.plaintextSecret` (via the request override
 * that appends the apikey to the URL) and composes the abort signal from
 * `ctx.signal` itself.
 *
 * `BaseHttpClient.buildUrl` joins `config.baseUrl + path`, so we pass
 * `/${method}` so the final URL is `<baseUrl>/<method>?...&apikey=<key>`.
 */
export const buildLegacyShim = (client: BingHttpClient, ctx: FetchContext): BingHttp =>
	({
		get: async (
			method: string,
			query: Record<string, string>,
			_plaintextCredential: string,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			// `BaseHttpClient.get` returns parsed JSON; for empty bodies it
			// returns `undefined`, which the legacy contract represents as
			// `null` in `BingHttp.get`. Normalise so callers see the same
			// shape regardless of which path produced the value.
			const parsed = await client.get<unknown>(`/${method}`, query, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as BingHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
