/**
 * Minimal HTTP client for the Anthropic Messages API. The same caveats apply
 * as the OpenAI client: dependency-free so we don't pull the `@anthropic-ai/sdk`
 * weight, and the surface is intentionally small (one POST helper).
 */
import type { FetchContext } from '@rankpulse/provider-core';
import {
	BaseHttpClient,
	type BaseHttpClientOptions,
	type HttpConfig,
	ProviderApiError,
} from '@rankpulse/provider-core';

export interface AnthropicHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = '2023-06-01';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'anthropic';

/**
 * BaseHttpClient adapter for the Anthropic Messages API.
 *
 * Anthropic's auth model is two-pronged: the secret API key goes in
 * `x-api-key: <key>` (NOT `Authorization: Bearer ...`), AND every request
 * MUST also carry the fixed `anthropic-version: 2023-06-01` header. The
 * default `BaseHttpClient.applyAuth` for `kind: 'api-key-header'` only
 * emits the secret-bearing header, so we override `applyAuth` to emit
 * BOTH — `applyAuth` is the documented hook for "all auth-related
 * headers", which includes the API version pin Anthropic treats as part
 * of the auth contract.
 *
 * Body capping (8MB) lives on `manifest.http.maxResponseBytes`; the
 * base client enforces it via Content-Length pre-flight + post-read
 * guard, so this class no longer needs a `request<T>` override.
 *
 * Used by the manifest path. The legacy `AnthropicHttp` class below
 * preserves the existing `fetchMessagesWithWebSearch(http:
 * AnthropicHttp, ...)` signature for the OLD `AnthropicProvider`, which
 * Phase 7 deletes.
 */
export class AnthropicHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig, options: BaseHttpClientOptions = {}) {
		super(PROVIDER_ID, config, options);
	}

	/**
	 * Override the auth-header pass to emit BOTH the `x-api-key` secret AND
	 * the fixed `anthropic-version` pin. Anthropic treats the version header
	 * as part of the auth contract — requests without it are rejected with
	 * 400 regardless of the API key. The default `applyAuth` for
	 * `'api-key-header'` would only emit the key, so we extend it here. This
	 * keeps the authoritative list of auth-related headers in one place
	 * (`applyAuth` is the documented hook for exactly that).
	 */
	protected override applyAuth(plaintextSecret: string, _body: unknown): Record<string, string> {
		return {
			'x-api-key': plaintextSecret,
			'anthropic-version': ANTHROPIC_VERSION,
		};
	}
}

/**
 * Legacy POST wrapper used by the existing `fetchMessagesWithWebSearch(http:
 * AnthropicHttp, ...)` helper and the `AnthropicProvider` class (deleted in
 * Phase 7). Retained verbatim so the OLD code path continues to work
 * alongside the NEW manifest path.
 */
export class AnthropicHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: AnthropicHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async post(path: string, body: unknown, apiKey: string, signal?: AbortSignal): Promise<unknown> {
		const url = `${this.baseUrl}${path}`;
		const internalAbort = new AbortController();
		const timeoutHandle = setTimeout(() => internalAbort.abort(), this.timeoutMs);
		const composedSignal = legacyComposeSignals(signal, internalAbort.signal);

		try {
			const response = await this.fetchImpl(url, {
				method: 'POST',
				headers: {
					'x-api-key': apiKey,
					'anthropic-version': ANTHROPIC_VERSION,
					'content-type': 'application/json',
					accept: 'application/json',
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
					`Anthropic ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					undefined,
					`Anthropic ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
					`Anthropic ${path} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

/**
 * Backward-compat alias. The old per-provider `AnthropicApiError` class is
 * gone; consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:151` does an
 * `instanceof AnthropicApiError && (status === 402 || status === 429)`
 * check) still import this name, so we re-export `ProviderApiError`
 * under it. This preserves the `instanceof` check for both legacy AND
 * new code paths — `ProviderApiError` thrown by `AnthropicHttpClient` will
 * also satisfy `instanceof AnthropicApiError`. Phases 5/6 retire the
 * worker code path; Phase 7 can drop this alias when no callers remain.
 */
export const AnthropicApiError = ProviderApiError;
export type AnthropicApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchMessagesWithWebSearch(http:
 * AnthropicHttp, ...)` helper call through `AnthropicHttpClient` instead
 * of `AnthropicHttp`. The manifest path uses this so a single
 * `BaseHttpClient` instance handles auth, timeouts and error wrapping;
 * the helper keeps its current `(http: AnthropicHttp, params, ctx)`
 * signature until Phase 5 inlines it.
 *
 * The shim translates the legacy `(path, body, apiKey, signal) =>
 * Promise<unknown>` shape into a `BaseHttpClient.post` call. The
 * `apiKey` argument is ignored because the credential is already wired
 * through `ctx.credential.plaintextSecret` and applied by the client's
 * `applyAuth` override.
 *
 * `BaseHttpClient.post` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `AnthropicHttp.post`. Normalise so callers see the same shape
 * regardless of which path produced the value.
 */
export const buildLegacyShim = (client: AnthropicHttpClient, ctx: FetchContext): AnthropicHttp =>
	({
		post: async (path: string, body: unknown, _apiKey: string, _signal?: AbortSignal): Promise<unknown> => {
			const parsed = await client.post<unknown>(path, {}, body, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as AnthropicHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const legacyComposeSignals = (a: AbortSignal | undefined, b: AbortSignal): AbortSignal => {
	if (!a) return b;
	const controller = new AbortController();
	const onAbort = (): void => controller.abort();
	a.addEventListener('abort', onAbort, { once: true });
	b.addEventListener('abort', onAbort, { once: true });
	if (a.aborted || b.aborted) controller.abort();
	return controller.signal;
};
