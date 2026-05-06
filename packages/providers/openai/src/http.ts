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
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';

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
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'openai';

/**
 * Composes two AbortSignals so the request aborts when EITHER fires.
 * Caller-provided signal (job cancellation) + internal timeout signal.
 *
 * Duplicated from `BaseHttpClient` (where it's a private module-level helper)
 * because this client overrides `request` rather than `applyAuth`. See the
 * class header for the rationale.
 */
function composeBaseSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
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
 * BaseHttpClient adapter for the OpenAI Responses API.
 *
 * Auth is the simplest case: a single bearer API key applied as
 * `Authorization: Bearer <plaintext>`. The default
 * `BaseHttpClient.applyAuth` for `kind: 'bearer-token'` already produces
 * exactly that header, so we re-use it via `super.applyAuth(...)` rather
 * than duplicating the logic.
 *
 * The ONLY reason we override `request` here (instead of just relying on
 * the base) is to enforce OpenAI's 8MB response body cap. The
 * `/v1/responses` payload is usually a few hundred KB, but a long answer
 * with many citations can balloon; the cap aborts runaway responses
 * before they can OOM the worker.
 *
 * Used by the manifest path (Phase 5+). The legacy `OpenAiHttp` class
 * below preserves the existing `OpenAiHttp.post(path, body, apiKey, signal)`
 * signature for the OLD `OpenAiProvider`, which Phase 7 deletes.
 */
export class OpenAiHttpClient extends BaseHttpClient {
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
		const signal = composeBaseSignals(ctx.signal, internalSignal);

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
				`OpenAI ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`OpenAI ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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
