import { buildBasicAuthHeader, parseCredential } from './credential.js';

export interface DataForSeoHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.dataforseo.com';

/**
 * Thin POST wrapper around `fetch`. DataForSEO endpoints all accept JSON arrays
 * of task objects; we shape the request that way. Returns the parsed JSON
 * response; raising on non-2xx so the caller can persist the error and let
 * the worker decide whether to retry.
 */
export class DataForSeoHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: DataForSeoHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async post(
		path: string,
		body: unknown[],
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const creds = parseCredential(plaintextCredential);
		const url = `${this.baseUrl}${path}`;
		const response = await this.fetchImpl(url, {
			method: 'POST',
			headers: {
				Authorization: buildBasicAuthHeader(creds),
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(body),
			signal,
		});
		const text = await response.text();
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new DataForSeoApiError(
				response.status,
				parsed,
				`DataForSEO ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

export class DataForSeoApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'DataForSeoApiError';
	}
}

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
