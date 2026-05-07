/**
 * Minimal HTTP client for Perplexity's chat-completions endpoint. Perplexity
 * speaks an OpenAI-compatible REST API on a different host, so the surface
 * here is essentially a relabelled OpenAI client (Bearer auth + JSON body).
 */
import type { FetchContext } from '@rankpulse/provider-core';
import {
	BaseHttpClient,
	type BaseHttpClientOptions,
	type HttpConfig,
	ProviderApiError,
} from '@rankpulse/provider-core';

export interface PerplexityHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_TIMEOUT_MS = 60_000;
/**
 * Cap on response body. Perplexity Sonar answers usually fit in a few KB,
 * but a misbehaving model run with many citations could produce
 * surprisingly large payloads; 8MB is a generous safety net. Lives on
 * `manifest.http.maxResponseBytes`; kept here as a constant so the
 * legacy `PerplexityHttp` path (below) enforces the same cap.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'perplexity';

/**
 * BaseHttpClient adapter for Perplexity's Sonar chat-completions endpoint.
 *
 * Auth is the simplest case: a single bearer token applied as
 * `Authorization: Bearer <plaintext>`. The default
 * `BaseHttpClient.applyAuth` for `kind: 'bearer-token'` already produces
 * exactly that header, so no override is needed.
 *
 * Body capping (8MB) lives on `manifest.http.maxResponseBytes`; the
 * base client enforces it via Content-Length pre-flight + post-read
 * guard, so this class no longer needs a `request<T>` override.
 *
 * Used by the manifest path (Phase 5+). The legacy `PerplexityHttp` class
 * below preserves the existing `fetchSonarSearch(http: PerplexityHttp,
 * ...)` signature for the OLD `PerplexityProvider`, which Phase 7 deletes.
 */
export class PerplexityHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig, options: BaseHttpClientOptions = {}) {
		super(PROVIDER_ID, config, options);
	}
}

/**
 * Legacy POST wrapper used by the existing `fetchSonarSearch(http:
 * PerplexityHttp, ...)` helper and the `PerplexityProvider` class
 * (deleted in Phase 7). Retained verbatim so the OLD code path continues
 * to work alongside the NEW manifest path.
 */
export class PerplexityHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: PerplexityHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async post(path: string, body: unknown, apiKey: string, signal?: AbortSignal): Promise<unknown> {
		const url = `${this.baseUrl}${path}`;
		const internalAbort = new AbortController();
		const timeoutHandle = setTimeout(() => internalAbort.abort(), this.timeoutMs);
		const composedSignal = composeSignals(signal, internalAbort.signal);

		try {
			const response = await this.fetchImpl(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(body),
				signal: composedSignal,
			});
			const contentLength = response.headers.get('content-length');
			if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					undefined,
					`Perplexity ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					undefined,
					`Perplexity ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
					`Perplexity ${path} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

/**
 * Backward-compat alias. The old per-provider `PerplexityApiError` class
 * is gone; consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:154` does an
 * `instanceof PerplexityApiError && (status === 402 || status === 429)`
 * check) still import this name, so we re-export `ProviderApiError`
 * under it. This preserves the `instanceof` check for both legacy AND
 * new code paths — `ProviderApiError` thrown by `PerplexityHttpClient`
 * will also satisfy `instanceof PerplexityApiError`. Phases 5/6 retire
 * the worker code path; Phase 7 can drop this alias when no callers
 * remain.
 */
export const PerplexityApiError = ProviderApiError;
export type PerplexityApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchSonarSearch(http: PerplexityHttp,
 * ...)` helper call through `PerplexityHttpClient` instead of
 * `PerplexityHttp`. The manifest path uses this so a single
 * `BaseHttpClient` instance handles auth, timeouts and error wrapping;
 * the helper keeps its current signature.
 *
 * Perplexity is body-only (POST /chat/completions with the prompt);
 * there are no query-string args, so the shim simply forwards `path` and
 * `body` to `BaseHttpClient.post` with an empty query record. The
 * shim drops `_apiKey` and `_signal` because `BaseHttpClient` already
 * pulls them from `ctx`.
 *
 * `BaseHttpClient.post` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `PerplexityHttp.post`. Normalise so callers see the same shape
 * regardless of which path produced the value.
 */
export const buildLegacyShim = (client: PerplexityHttpClient, ctx: FetchContext): PerplexityHttp =>
	({
		post: async (path: string, body: unknown, _apiKey: string, _signal?: AbortSignal): Promise<unknown> => {
			const parsed = await client.post<unknown>(path, {}, body, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as PerplexityHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const composeSignals = (a: AbortSignal | undefined, b: AbortSignal): AbortSignal => {
	if (!a) return b;
	const controller = new AbortController();
	const onAbort = (): void => controller.abort();
	a.addEventListener('abort', onAbort, { once: true });
	b.addEventListener('abort', onAbort, { once: true });
	if (a.aborted || b.aborted) controller.abort();
	return controller.signal;
};
