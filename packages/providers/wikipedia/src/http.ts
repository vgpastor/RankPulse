/**
 * Wikimedia REST API client. The API is unauthenticated; the only
 * etiquette requirement is a descriptive `User-Agent` so the Wikimedia
 * ops team can contact us if our usage pattern misbehaves
 * (https://wikitech.wikimedia.org/wiki/Robot_policy).
 */

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

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
