/**
 * Microsoft Clarity Data Export API client. Auth = Bearer token. The
 * free tier allows 10 req/day per project — generous for a daily cron
 * (we use 1) but tight enough that we declare the rate limit explicitly
 * in the descriptor so backfills don't burn the budget in seconds.
 */
import { validateClarityToken } from './credential.js';

export interface ClarityHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://www.clarity.ms/export-data/api/v1';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class ClarityApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'ClarityApiError';
	}
}

export class ClarityHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: ClarityHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const token = validateClarityToken(plaintextCredential);
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		const url = `${this.baseUrl}${path}${params.size > 0 ? `?${params.toString()}` : ''}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ClarityApiError(
				response.status,
				null,
				`Clarity ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ClarityApiError(
				response.status,
				null,
				`Clarity ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ClarityApiError(response.status, parsed, `Clarity ${path} returned HTTP ${response.status}`);
		}
		return parsed;
	}
}

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
