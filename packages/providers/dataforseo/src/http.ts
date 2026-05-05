import { buildBasicAuthHeader, parseCredential } from './credential.js';

export interface DataForSeoHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.dataforseo.com';

/**
 * Hard cap on response body size. DataForSEO SERPs cap around 1MB; the
 * GSC search-analytics endpoint with rowLimit=25000 sits around 5-8MB.
 * 32MB leaves a generous margin for legitimate payloads while killing
 * runaway responses that would OOM the worker before the JSON parser
 * even returns.
 */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

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
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new DataForSeoApiError(
				response.status,
				null,
				`DataForSEO ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
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

/**
 * DataForSEO returns HTTP 200 even when the task itself failed — the
 * real status lives in the body's `status_code`. Codes:
 *   - 20000          : task ok
 *   - 20100-20999    : informational (still success, no items)
 *   - 40000-49999    : client/auth/quota error
 *   - 50000-59999    : provider-side error
 *
 * Without this check the processor persists an empty payload as a
 * successful run AND charges the operator's ledger. Failure budget +
 * silent data loss.
 */
export const ensureTaskOk = (path: string, raw: { status_code: number; status_message: string }): void => {
	if (raw.status_code === 20000 || (raw.status_code >= 20100 && raw.status_code < 30000)) return;
	throw new DataForSeoApiError(
		raw.status_code,
		raw,
		`DataForSEO ${path} task error ${raw.status_code}: ${raw.status_message}`,
	);
};

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
