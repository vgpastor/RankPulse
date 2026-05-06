/**
 * Wikimedia REST API client. The API is unauthenticated; the only
 * etiquette requirement is a descriptive `User-Agent` so the Wikimedia
 * ops team can contact us if our usage pattern misbehaves
 * (https://wikitech.wikimedia.org/wiki/Robot_policy).
 */
import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';

export interface WikipediaHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	/** Override the User-Agent (defaults to RankPulse contact). */
	userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://wikimedia.org/api/rest_v1';
const DEFAULT_USER_AGENT = 'RankPulse/1.0 (https://github.com/vgpastor/rankpulse; ops@rankpulse.local)';

/**
 * Cap on response body — Wikipedia daily-views per article rarely
 * exceeds a few KB, even for the longest date ranges. 4MB is generous
 * but tight enough to abort runaway responses before OOM.
 */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'wikipedia';

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
 * BaseHttpClient adapter for Wikimedia REST.
 *
 * The default `BaseHttpClient.applyAuth` throws for `kind: 'custom'` strategies
 * — it's a placeholder. Wikipedia is unauthenticated, so the manifest declares
 * `auth: { kind: 'custom', sign }` with a no-op `sign` function (semantically
 * "no auth"). Today `BaseHttpClient` does not dispatch to `sign`, so we
 * override `request` here to skip auth entirely and apply Wikimedia's robot
 * policy headers (`User-Agent` for contact, `Accept: application/json`,
 * `Accept-Encoding: gzip`).
 *
 * Used by the manifest path (Phase 5+). The legacy `WikipediaHttp` class
 * below preserves the existing `fetchPageviewsPerArticle(http: WikipediaHttp,
 * ...)` and `fetchTopArticles` signatures for the OLD `WikipediaProvider`,
 * which Phase 7 deletes.
 */
export class WikipediaHttpClient extends BaseHttpClient {
	private readonly fetchImpl: typeof fetch;
	private readonly userAgent: string;

	constructor(config: HttpConfig, options: { fetchImpl?: typeof fetch; userAgent?: string } = {}) {
		super(PROVIDER_ID, config);
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
	}

	protected override async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		// Wikipedia REST is unauthenticated — no plaintextSecret check, no
		// auth header. Operators register a sentinel string ("public") in
		// the credential ledger so the registration flow stays uniform.

		const url = this.buildUrl(path, query);

		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const headers: Record<string, string> = {
			'User-Agent': this.userAgent,
			Accept: 'application/json',
			'Accept-Encoding': 'gzip',
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
				`Wikipedia ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Wikipedia ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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
 * Legacy GET wrapper used by the existing `fetchPageviewsPerArticle` /
 * `fetchTopArticles` helpers and the `WikipediaProvider` class (deleted in
 * Phase 7). Retained verbatim so the OLD code path continues to work
 * alongside the NEW manifest path.
 */
export class WikipediaHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly userAgent: string;

	constructor(options: WikipediaHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
		this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
	}

	async get(path: string, signal?: AbortSignal): Promise<unknown> {
		const url = `${this.baseUrl}${path}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: {
				'User-Agent': this.userAgent,
				Accept: 'application/json',
				'Accept-Encoding': 'gzip',
			},
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new WikipediaApiError(
				response.status,
				null,
				`Wikipedia ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new WikipediaApiError(
				response.status,
				null,
				`Wikipedia ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new WikipediaApiError(
				response.status,
				parsed,
				`Wikipedia ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Legacy provider-specific error class. The worker processor's quota
 * detector (`apps/worker/src/processors/provider-fetch.processor.ts:125`)
 * does an `instanceof WikipediaApiError && err.status === 402` check; the
 * check is purely defensive — Wikipedia is a public API with no quota and
 * never returns 402 in practice. New code (manifest path) throws
 * `ProviderApiError` from `@rankpulse/provider-core` directly. Kept
 * verbatim until Phase 7 removes the legacy code path.
 */
export class WikipediaApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'WikipediaApiError';
	}
}

/**
 * Adapter that lets the existing `fetchPageviewsPerArticle(http:
 * WikipediaHttp, ...)` / `fetchTopArticles(http: WikipediaHttp, ...)`
 * helpers call through `WikipediaHttpClient` instead of `WikipediaHttp`.
 * The manifest path uses this so a single `BaseHttpClient` instance handles
 * timeouts and error wrapping; the helpers keep their current signature.
 *
 * The shim accepts the legacy 2-arg signature (`path, signal`) but ignores
 * the signal — `BaseHttpClient` composes the abort signal from `ctx.signal`
 * itself. `BaseHttpClient.get` returns parsed JSON; for empty bodies it
 * returns `undefined`, which the legacy contract represents as `null` in
 * `WikipediaHttp.get`. Normalise so callers see the same shape regardless
 * of which path produced the value.
 */
export const buildLegacyShim = (client: WikipediaHttpClient, ctx: FetchContext): WikipediaHttp =>
	({
		get: async (path: string, _signal?: AbortSignal): Promise<unknown> => {
			const parsed = await client.get<unknown>(path, {}, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as WikipediaHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
