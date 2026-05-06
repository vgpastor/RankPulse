/**
 * Minimal HTTP client for Google AI Studio's `generativelanguage.googleapis.com`
 * endpoints. Auth is via `x-goog-api-key` header (the alternative `?key=` query
 * param leaks the key into request logs / proxy access logs — header is the
 * sensible default).
 */

import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';

export interface GoogleAiStudioHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 60_000;

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'google-ai-studio';

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
 * BaseHttpClient adapter for Google AI Studio (`generativelanguage.googleapis.com`).
 *
 * Auth is the simplest header case: a single API key applied as
 * `x-goog-api-key: <plaintext>`. The default
 * `BaseHttpClient.applyAuth` for `kind: 'api-key-header'` already produces
 * exactly that header (using the manifest's `headerName`), so we re-use it
 * via `super.applyAuth(...)` rather than duplicating the logic.
 *
 * The ONLY reason we override `request` here (instead of just relying on
 * the base) is to enforce Google AI Studio's 8MB response body cap.
 * Gemini `generateContent` payloads are usually small, but a 4000-token
 * output paired with verbose grounding metadata can produce surprisingly
 * large responses; the cap aborts runaway responses before they can OOM
 * the worker.
 *
 * Used by the manifest path (Phase 5+). The legacy `GoogleAiStudioHttp`
 * class below preserves the existing `fetchGeminiGrounded(http:
 * GoogleAiStudioHttp, ...)` signature for the OLD `GoogleAiStudioProvider`,
 * which Phase 7 deletes.
 */
export class GoogleAiStudioHttpClient extends BaseHttpClient {
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

		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
		const signal = composeSignals(ctx.signal, internalSignal);

		// Re-use the parent's api-key-header construction so we don't
		// duplicate the `x-goog-api-key: <plaintext>` formatting.
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
				`Google AI Studio ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Google AI Studio ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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
 * Legacy POST wrapper used by the existing `fetchGeminiGrounded(http:
 * GoogleAiStudioHttp, ...)` helper and the `GoogleAiStudioProvider` class
 * (deleted in Phase 7). Retained verbatim so the OLD code path continues
 * to work alongside the NEW manifest path.
 */
export class GoogleAiStudioHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: GoogleAiStudioHttpOptions = {}) {
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
					'x-goog-api-key': apiKey,
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
					`Google AI Studio ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					undefined,
					`Google AI Studio ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new ProviderApiError(
					PROVIDER_ID,
					response.status,
					typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
					`Google AI Studio ${path} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

/**
 * Backward-compat alias. The old per-provider `GoogleAiStudioApiError`
 * class is gone; consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:157` does an
 * `instanceof GoogleAiStudioApiError && (status === 402 || status === 429)`
 * check) still import this name, so we re-export `ProviderApiError` under
 * it. This preserves the `instanceof` check for both legacy AND new code
 * paths — `ProviderApiError` thrown by `GoogleAiStudioHttpClient` will
 * also satisfy `instanceof GoogleAiStudioApiError`. Phases 5/6 retire the
 * worker code path; Phase 7 can drop this alias when no callers remain.
 */
export const GoogleAiStudioApiError = ProviderApiError;
export type GoogleAiStudioApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchGeminiGrounded(http:
 * GoogleAiStudioHttp, ...)` helper call through `GoogleAiStudioHttpClient`
 * instead of `GoogleAiStudioHttp`. The manifest path uses this so a single
 * `BaseHttpClient` instance handles auth, timeouts and error wrapping; the
 * helper keeps its current signature.
 *
 * `BaseHttpClient.post` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `GoogleAiStudioHttp.post`. Normalise so callers see the same shape
 * regardless of which path produced the value.
 *
 * The shim ignores the legacy `apiKey` parameter — `GoogleAiStudioHttpClient`
 * resolves auth from `ctx.credential.plaintextSecret` directly via the
 * parent's `applyAuth`. The legacy helper still passes the resolved key
 * only because its signature predates the new client; the manifest's
 * `adapt` closure threads a sentinel value through that the shim
 * discards.
 */
export const buildLegacyShim = (client: GoogleAiStudioHttpClient, ctx: FetchContext): GoogleAiStudioHttp =>
	({
		post: async (path: string, body: unknown, _apiKey: string, _signal?: AbortSignal): Promise<unknown> => {
			const parsed = await client.post<unknown>(path, {}, body, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as GoogleAiStudioHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
