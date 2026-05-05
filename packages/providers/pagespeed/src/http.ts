/**
 * Google PageSpeed Insights v5 client. Auth: API key as query param.
 * Free tier: 1 req/sec, 25k/day per key. Without a key Google still
 * accepts the request but applies a much harsher per-IP throttle that
 * would fail in shared egress (CI runners, bursty cron). The descriptor
 * declares the rate limit so the scheduling layer doesn't over-fan-out.
 */

export interface PageSpeedHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://www.googleapis.com';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class PageSpeedHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: PageSpeedHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(path: string, query: Record<string, string | string[]>, signal?: AbortSignal): Promise<unknown> {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		const url = `${this.baseUrl}${path}?${params.toString()}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal,
		});
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
