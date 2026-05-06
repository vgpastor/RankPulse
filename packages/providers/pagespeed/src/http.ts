/**
 * Google PageSpeed Insights v5 client. Supports two auth modes — API key
 * as a query param, or OAuth2 Bearer token from a service account.
 *
 * Free tier with API key: 1 req/sec, 25k/day per key.
 * SA OAuth: same daily quota, scoped per-project on Google Cloud.
 *
 * Both flows hit the same v5 endpoint; only the auth surface differs.
 * Pick the right one by inspecting the credential's plaintextSecret —
 * see `provider.ts` for the polymorphic dispatch.
 */

export interface PageSpeedHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

export type PageSpeedAuth = { kind: 'apiKey'; apiKey: string } | { kind: 'bearer'; token: string };

const DEFAULT_BASE_URL = 'https://www.googleapis.com';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class PageSpeedHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: PageSpeedHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		auth: PageSpeedAuth,
		signal?: AbortSignal,
	): Promise<unknown> {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		// API key goes as ?key=... ; Bearer goes in the Authorization header.
		// PSI accepts either but never both — Google logs warnings if both
		// reach the same request.
		if (auth.kind === 'apiKey') params.append('key', auth.apiKey);
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (auth.kind === 'bearer') headers.Authorization = `Bearer ${auth.token}`;
		const url = `${this.baseUrl}${path}?${params.toString()}`;
		const response = await this.fetchImpl(url, { method: 'GET', headers, signal });
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new PageSpeedApiError(
				response.status,
				null,
				`PSI ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new PageSpeedApiError(
				response.status,
				null,
				`PSI ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new PageSpeedApiError(response.status, parsed, `PSI ${path} returned HTTP ${response.status}`);
		}
		return parsed;
	}
}

export class PageSpeedApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'PageSpeedApiError';
	}
}

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
