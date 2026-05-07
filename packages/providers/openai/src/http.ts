/**
 * Minimal HTTP client for the OpenAI Responses API. Kept dependency-free so
 * the provider package doesn't pull `openai` SDK weight (which is heavy and
 * also tightly couples versioning of the SDK to RankPulse's release cadence).
 *
 * Surface area we use here:
 *  - `POST /v1/responses` with `model`, `input`, `tools: [{ type: 'web_search' }]`.
 *  - Response `output[]` array containing `web_search_call` and `message` items.
 *  - Response `usage` with `input_tokens`, `output_tokens`, `cached_tokens`.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import {
	BaseHttpClient,
	type BaseHttpClientOptions,
	type HttpConfig,
	ProviderApiError,
} from '@rankpulse/provider-core';

export interface OpenAiHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	/** Optional override for the per-request timeout, in ms. */
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Cap on response body. The OpenAI `/v1/responses` payload includes the
 * full text plus annotations, occasionally hits a few hundred KB; 8MB is
 * generous but still tight enough to abort runaway responses before OOM.
 * Lives on `manifest.http.maxResponseBytes`; kept here as a constant so
 * the legacy `OpenAiHttp` path (below) enforces the same cap.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'openai';

/**
 * BaseHttpClient adapter for the OpenAI Responses API.
 *
 * Auth is the simplest case: a single bearer API key applied as
 * `Authorization: Bearer <plaintext>`. The default
 * `BaseHttpClient.applyAuth` for `kind: 'bearer-token'` already produces
 * exactly that header, so no override here.
 *
 * The 8MB body cap moved to `manifest.http.maxResponseBytes` and is
 * enforced by `BaseHttpClient.parseResponse` (Content-Length pre-flight
 * + post-read guard). No `request<T>` override needed.
 *
 * Used by the manifest path. The legacy `OpenAiHttp` class below
 * preserves the existing `OpenAiHttp.post(path, body, apiKey, signal)`
 * signature for the OLD `OpenAiProvider`, which Phase 7 deletes.
 */
export class OpenAiHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig, options: BaseHttpClientOptions = {}) {
		super(PROVIDER_ID, config, options);
	}
}

/**
 * Legacy POST wrapper used by the existing
 * `fetchResponsesWithWebSearch(http: OpenAiHttp, ...)` helper and the
 * `OpenAiProvider` class (deleted in Phase 7). Retained verbatim so the
 * OLD code path continues to work alongside the NEW manifest path.
 */
export class OpenAiHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: OpenAiHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async post(path: string, body: unknown, apiKey: string, signal?: AbortSignal): Promise<unknown> {
		const url = `${this.baseUrl}${path}`;
		const internalAbort = new AbortController();
		const timeoutHandle = setTimeout(() => internalAbort.abort(), this.timeoutMs);
		const composedSignal = composeLegacySignals(signal, internalAbort.signal);

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
				throw buildLegacyOpenAiApiError(
					response.status,
					null,
					`OpenAI ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw buildLegacyOpenAiApiError(
					response.status,
					null,
					`OpenAI ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw buildLegacyOpenAiApiError(
					response.status,
					parsed,
					`OpenAI ${path} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

/**
 * Backward-compat alias. The old per-provider `OpenAiApiError` class is
 * gone; consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:149` does an
 * `instanceof OpenAiApiError && (status === 402 || status === 429)`
 * check) still import this name, so we re-export `ProviderApiError`
 * under it. This preserves the `instanceof` check for both legacy AND
 * new code paths — `ProviderApiError` thrown by `OpenAiHttpClient` will
 * also satisfy `instanceof OpenAiApiError`. Phases 5/6 retire the
 * worker code path; Phase 7 can drop this alias when no callers remain.
 *
 * The legacy `OpenAiHttp.post` constructs its errors with
 * `new OpenAiApiError(status, body, message)` (3 args; previous class
 * shape). The runtime alias here is `ProviderApiError`, whose
 * constructor signature is `(providerId, status, body, message)`. The
 * legacy call sites are routed through `buildLegacyOpenAiApiError` so
 * the runtime shape produced by both paths matches `ProviderApiError`.
 */
export const OpenAiApiError = ProviderApiError;
export type OpenAiApiError = ProviderApiError;

/**
 * Helper that adapts the legacy 3-arg constructor pattern (status, body,
 * message) used by `OpenAiHttp` into the unified `ProviderApiError`
 * shape (`providerId, status, body, message`). Body is stringified to
 * preserve the diagnostic information that the previous class accepted
 * as `unknown`.
 */
const buildLegacyOpenAiApiError = (status: number, body: unknown, message: string): ProviderApiError => {
	const stringBody =
		body === null || body === undefined
			? undefined
			: typeof body === 'string'
				? body.slice(0, RESPONSE_BODY_MAX_BYTES)
				: safeStringify(body);
	return new ProviderApiError(PROVIDER_ID, status, stringBody, message);
};

const safeStringify = (value: unknown): string => {
	try {
		return JSON.stringify(value).slice(0, RESPONSE_BODY_MAX_BYTES);
	} catch {
		return String(value).slice(0, RESPONSE_BODY_MAX_BYTES);
	}
};

/**
 * Adapter that lets the existing
 * `fetchResponsesWithWebSearch(http: OpenAiHttp, ...)` helper call
 * through `OpenAiHttpClient` instead of `OpenAiHttp`. The manifest path
 * uses this so a single `BaseHttpClient` instance handles auth,
 * timeouts and error wrapping; the helper keeps its current signature.
 *
 * `BaseHttpClient.post` returns parsed JSON; for empty bodies it
 * returns `undefined`, which the legacy contract represents as `null`
 * in `OpenAiHttp.post`. Normalise so callers see the same shape
 * regardless of which path produced the value.
 */
export const buildLegacyShim = (client: OpenAiHttpClient, ctx: FetchContext): OpenAiHttp =>
	({
		post: async (path: string, body: unknown, _apiKey: string, _signal?: AbortSignal): Promise<unknown> => {
			const parsed = await client.post<unknown>(path, {}, body, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as OpenAiHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const composeLegacySignals = (a: AbortSignal | undefined, b: AbortSignal): AbortSignal => {
	if (!a) return b;
	const controller = new AbortController();
	const onAbort = (): void => controller.abort();
	a.addEventListener('abort', onAbort, { once: true });
	b.addEventListener('abort', onAbort, { once: true });
	if (a.aborted || b.aborted) controller.abort();
	return controller.signal;
};
