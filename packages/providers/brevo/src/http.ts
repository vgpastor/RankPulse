/**
 * Brevo REST API client. Auth = `api-key: <plaintext>` header (NOT Bearer).
 * Free tier is 300 emails/day; the rate-limit on read endpoints is generous
 * (~10 req/s per key). Descriptors declare a tighter 60 req/min so a
 * misconfigured cron can't drain the quota in a stuck retry loop.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';
import { validateBrevoApiKey } from './credential.js';

export interface BrevoHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.brevo.com/v3';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'brevo';

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
	if (real.length === 1) return real[0]!;
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
 * BaseHttpClient adapter for Brevo (Sendinblue) REST API v3.
 *
 * Auth is the simplest non-Bearer case: a single API key applied as
 * `api-key: <plaintext>` (NOT `Authorization: Bearer ...`). The default
 * `BaseHttpClient.applyAuth` for `kind: 'api-key-header'` already produces
 * exactly that header, so we re-use it via `super.applyAuth(...)` rather
 * than duplicating the logic.
 *
 * The ONLY reason we override `request` here (instead of just relying on
 * the base) is to enforce Brevo's 8MB response body cap. Brevo statistics
 * payloads are usually small, but the `/contacts/{id}` endpoint can return
 * large per-contact event streams when a recipient has been on heavy
 * campaigns for years; the cap aborts runaway responses before they can
 * OOM the worker.
 *
 * Used by the manifest path (Phase 5+). The legacy `BrevoHttp` class
 * below preserves the existing `fetch<X>(http: BrevoHttp, ...)` signature
 * for the OLD `BrevoProvider`, which Phase 7 deletes.
 */
export class BrevoHttpClient extends BaseHttpClient {
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

		// Re-use the parent's api-key-header construction so we don't
		// duplicate the `api-key: <plaintext>` formatting. The default
		// `applyAuth` for `kind: 'api-key-header'` returns exactly
		// `{ [headerName]: plaintextSecret }` which is all Brevo needs.
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
				`Brevo ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Brevo ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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
 * Legacy GET wrapper used by the existing `fetch<X>(http: BrevoHttp, ...)`
 * helpers and the `BrevoProvider` class (deleted in Phase 7). Retained
 * verbatim so the OLD code path continues to work alongside the NEW
 * manifest path.
 */
export class BrevoHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: BrevoHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[] | undefined>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const apiKey = validateBrevoApiKey(plaintextCredential);
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (v === undefined) continue;
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		const url = `${this.baseUrl}${path}${params.size > 0 ? `?${params.toString()}` : ''}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: {
				'api-key': apiKey,
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
				`Brevo ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Brevo ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`Brevo ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Backward-compat alias. The old per-provider `BrevoApiError` class is
 * gone; consumers (callers using `instanceof BrevoApiError` to discriminate
 * provider failures) still import this name, so we re-export
 * `ProviderApiError` under it. This preserves the `instanceof` check for
 * both legacy AND new code paths — `ProviderApiError` thrown by
 * `BrevoHttpClient` will also satisfy `instanceof BrevoApiError`. Phases
 * 5/6 retire the legacy code path; Phase 7 can drop this alias when no
 * callers remain.
 */
export const BrevoApiError = ProviderApiError;
export type BrevoApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetch<X>(http: BrevoHttp, ...)` helpers
 * call through `BrevoHttpClient` instead of `BrevoHttp`. The manifest path
 * uses this so a single `BaseHttpClient` instance handles auth, timeouts
 * and error wrapping; the helpers keep their current signature.
 *
 * The shim flattens query-shape variations (Brevo's helpers pass
 * `Record<string, string | string[] | undefined>` — undefined values must
 * be SKIPPED, otherwise `URLSearchParams` would serialize them as the
 * literal string `"undefined"`) into the path's query string before
 * calling `BaseHttpClient.get`, whose `query: Record<string, string>`
 * parameter cannot represent arrays nor undefined.
 *
 * `BaseHttpClient.get` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `BrevoHttp.get`. Normalise so callers see the same shape regardless
 * of which path produced the value.
 */
export const buildLegacyShim = (client: BrevoHttpClient, ctx: FetchContext): BrevoHttp =>
	({
		get: async (
			path: string,
			query: Record<string, string | string[] | undefined>,
			_plaintextCredential: string,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			const params = new URLSearchParams();
			for (const [k, v] of Object.entries(query)) {
				if (v === undefined) continue;
				if (Array.isArray(v)) for (const item of v) params.append(k, item);
				else params.append(k, v);
			}
			const fullPath = params.size > 0 ? `${path}?${params.toString()}` : path;
			const parsed = await client.get<unknown>(fullPath, {}, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as BrevoHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
