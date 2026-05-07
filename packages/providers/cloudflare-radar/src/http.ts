/**
 * Cloudflare Radar API client. Auth = Bearer token in `Authorization` header.
 * The free tier is generous (1.2k req/5min/account) but we declare a tighter
 * 60 req/min in descriptors so a misconfigured cron can't drain it.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';

export interface CloudflareRadarHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'cloudflare-radar';

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
 * BaseHttpClient adapter for Cloudflare Radar.
 *
 * Auth is the simplest case: a single bearer token applied as
 * `Authorization: Bearer <plaintext>`. The default
 * `BaseHttpClient.applyAuth` for `kind: 'bearer-token'` already produces
 * exactly that header, so we re-use it via `super.applyAuth(...)` rather
 * than duplicating the logic.
 *
 * The ONLY reason we override `request` here (instead of just relying on
 * the base) is to enforce Cloudflare Radar's 8MB response body cap. The
 * `/radar/ranking/domain/<domain>` payloads are usually tiny, but a
 * misbehaving upstream (or a future endpoint with category splits over
 * many dimensions) could produce surprisingly large responses; the cap
 * aborts runaway responses before they can OOM the worker.
 *
 * Used by the manifest path (Phase 5+). The legacy `CloudflareRadarHttp`
 * class below preserves the existing `fetchDomainRank(http: CloudflareRadarHttp, ...)`
 * signature for the OLD `CloudflareRadarProvider`, which Phase 7 deletes.
 */
export class CloudflareRadarHttpClient extends BaseHttpClient {
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
		const url = this.buildUrl(path, query);

		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		// Re-use the parent's bearer-token header construction so we don't
		// duplicate the `Authorization: Bearer <token>` formatting.
		const headers: Record<string, string> = {
			...this.applyAuth(ctx.credential.plaintextSecret, body),
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
				`Cloudflare ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Cloudflare ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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
 * Legacy GET wrapper used by the existing `fetchDomainRank(http:
 * CloudflareRadarHttp, ...)` helper and the `CloudflareRadarProvider`
 * class (deleted in Phase 7). Retained verbatim so the OLD code path
 * continues to work alongside the NEW manifest path.
 */
export class CloudflareRadarHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: CloudflareRadarHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		const url = `${this.baseUrl}${path}${params.size > 0 ? `?${params.toString()}` : ''}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${plaintextCredential}`,
				Accept: 'application/json',
			},
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Cloudflare ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Cloudflare ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`Cloudflare ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Backward-compat alias. The old per-provider `CloudflareRadarApiError`
 * class is gone; consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:138` does an
 * `instanceof CloudflareRadarApiError && (status === 402 || status === 429)`
 * check) still import this name, so we re-export `ProviderApiError`
 * under it. This preserves the `instanceof` check for both legacy AND
 * new code paths — `ProviderApiError` thrown by `CloudflareRadarHttpClient`
 * will also satisfy `instanceof CloudflareRadarApiError`. Phases 5/6
 * retire the worker code path; Phase 7 can drop this alias when no
 * callers remain.
 */
export const CloudflareRadarApiError = ProviderApiError;
export type CloudflareRadarApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchDomainRank(http: CloudflareRadarHttp, ...)`
 * helper call through `CloudflareRadarHttpClient` instead of
 * `CloudflareRadarHttp`. The manifest path uses this so a single
 * `BaseHttpClient` instance handles auth, timeouts and error wrapping;
 * the helper keeps its current signature.
 *
 * The shim flattens multi-value queries (Cloudflare Radar's
 * `rankingType`/`format` are single-valued today, but the shim mirrors
 * the legacy contract that accepts `string | string[]`) into the path's
 * query string before calling `BaseHttpClient.get`, whose
 * `query: Record<string, string>` parameter cannot represent arrays. The
 * empty-object query passed to the base method keeps the URL builder a
 * no-op for the query string.
 *
 * `BaseHttpClient.get` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `CloudflareRadarHttp.get`. Normalise so callers see the same shape
 * regardless of which path produced the value.
 */
export const buildLegacyShim = (client: CloudflareRadarHttpClient, ctx: FetchContext): CloudflareRadarHttp =>
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
	}) as CloudflareRadarHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
