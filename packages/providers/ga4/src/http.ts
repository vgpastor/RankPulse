import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';
import { JWT } from 'google-auth-library';
import { parseServiceAccount, type ServiceAccountKey } from './credential.js';

/**
 * Read-only scope for the Data API. `analytics.readonly` covers both core
 * reports and realtime; we never write so we don't request more.
 */
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

const PROVIDER_ID = 'google-analytics-4';

const RESPONSE_BODY_MAX_BYTES = 4_096;

/**
 * Hard cap on response body size. A `runReport` with low cardinality
 * dimensions and a long date range can easily produce multi-megabyte
 * payloads (a few hundred KB per day). 8MB matches the legacy `Ga4Http`
 * cap and leaves headroom for legitimate reports while killing runaway
 * responses that would OOM the worker before the JSON parser even returns.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

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
 * BaseHttpClient adapter for Google Analytics 4 (Data API v1beta).
 *
 * The default `BaseHttpClient.applyAuth` is synchronous: `(secret, body) =>
 * Record<string, string>`. Service Account auth requires an ASYNC step —
 * mint a signed JWT, POST it to Google's token endpoint, get an access
 * token — before any header can be set. There's no clean way to await that
 * inside `applyAuth`.
 *
 * Approach: leave `applyAuth` at its default (which throws for the
 * `service-account-jwt` strategy, signalling "you must override `request`")
 * and fully override `request` here. The override mints the access token
 * via `google-auth-library` (which caches tokens internally until expiry,
 * preserving today's semantics) and then performs the HTTP call directly.
 * No call to `super.request` — composing the bearer token AFTER the parent
 * has already built headers would require monkey-patching `applyAuth` per
 * call, which is uglier than the ~30 LOC duplication below.
 *
 * Used by the manifest path (Phase 5+). The legacy `Ga4Http` class below
 * preserves the existing `fetchRunReport(http: Ga4Http, ...)` signature
 * for the OLD `Ga4Provider`, which Phase 7 deletes.
 */
export class Ga4HttpClient extends BaseHttpClient {
	constructor(config: HttpConfig) {
		super(PROVIDER_ID, config);
	}

	protected override async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		// Mint (or reuse cached) access token for this Service Account. The
		// JWT instance is short-lived per-call but `google-auth-library`
		// caches the issued access_token internally keyed on
		// (client_email, scopes), so successive calls in the same process
		// reuse the token until it nears expiry.
		const sa = parseServiceAccount(ctx.credential.plaintextSecret);
		const jwt = this.buildJwt(sa);
		let accessToken: string | null | undefined;
		try {
			const tokenResponse = await jwt.authorize();
			accessToken = tokenResponse.access_token;
		} catch (err) {
			throw new ProviderApiError(
				PROVIDER_ID,
				0,
				undefined,
				`google-auth-library token mint failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		if (!accessToken) {
			throw new ProviderApiError(
				PROVIDER_ID,
				401,
				undefined,
				'Service account did not return an access_token',
			);
		}

		const url = this.buildUrl(path, query);
		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
		};
		const init: RequestInit = { method, signal, headers };
		if (body !== undefined && (method === 'POST' || method === 'PUT')) {
			init.body = JSON.stringify(body);
			headers['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await fetch(url, init);
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
				`GA4 ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		if (!response.ok) {
			const text = await safeText(response);
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				text,
				`${PROVIDER_ID} ${method} ${path} → ${response.status}`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`GA4 ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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

	private buildJwt(sa: ServiceAccountKey): JWT {
		return new JWT({
			email: sa.client_email,
			key: sa.private_key,
			scopes: SCOPES,
		});
	}
}

const safeText = async (response: Response): Promise<string> => {
	try {
		const text = await response.text();
		return text.slice(0, RESPONSE_BODY_MAX_BYTES);
	} catch {
		return '';
	}
};

/**
 * Service Account-authenticated client for the GA4 Data API. Each call
 * mints a fresh JWT-based access token via google-auth-library; the library
 * caches it internally until expiry.
 *
 * Legacy POST wrapper used by the existing `fetchRunReport` helper and the
 * `Ga4Provider` class (deleted in Phase 7). Retained verbatim so the OLD
 * code path continues to work alongside the NEW manifest path.
 */
export class Ga4Http {
	private readonly fetchImpl: typeof fetch;

	constructor(options: { fetchImpl?: typeof fetch } = {}) {
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async post(
		path: string,
		body: unknown,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const sa = parseServiceAccount(plaintextCredential);
		const jwt = this.buildJwt(sa);
		const tokenResponse = await jwt.authorize();
		if (!tokenResponse.access_token) {
			throw new ProviderApiError(
				PROVIDER_ID,
				401,
				undefined,
				'Service account did not return an access_token',
			);
		}
		const url = `https://analyticsdata.googleapis.com${path}`;
		const response = await this.fetchImpl(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tokenResponse.access_token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(body),
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`GA4 ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`GA4 ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`GA4 ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}

	private buildJwt(sa: ServiceAccountKey): JWT {
		return new JWT({
			email: sa.client_email,
			key: sa.private_key,
			scopes: SCOPES,
		});
	}
}

/**
 * Backward-compat alias. The old per-provider `Ga4ApiError` class is gone;
 * consumers (worker processor's quota detector, package tests) still import
 * this name, so we re-export `ProviderApiError` under it. Phases 5/6 retire
 * the worker code path; Phase 7 can drop this alias when no callers remain.
 */
export const Ga4ApiError = ProviderApiError;
export type Ga4ApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchRunReport(http: Ga4Http, ...)` helper
 * call through `Ga4HttpClient` instead of `Ga4Http`. The manifest path uses
 * this so a single `BaseHttpClient` instance handles auth, timeouts and
 * error wrapping; the helper keeps its current signature.
 *
 * The shim accepts the legacy 4-arg signature (`path, body, plaintext,
 * signal`) but ignores the last two parameters — `BaseHttpClient` reads the
 * credential from `ctx.credential.plaintextSecret` (via the request override
 * that mints the JWT) and composes the abort signal from `ctx.signal` itself.
 */
export const buildLegacyShim = (client: Ga4HttpClient, ctx: FetchContext): Ga4Http =>
	({
		post: async (
			path: string,
			body: unknown,
			_plaintextCredential: string,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			// `BaseHttpClient.post` returns parsed JSON; for empty bodies it
			// returns `undefined`, which the legacy contract represents as
			// `null` in `Ga4Http.post`. Normalise so callers see the same
			// shape regardless of which path produced the value.
			const parsed = await client.post<unknown>(path, {}, body, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as Ga4Http;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
