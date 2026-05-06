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
		const composedSignal = composeSignals(signal, internalAbort.signal);

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
				throw new OpenAiApiError(
					response.status,
					null,
					`OpenAI ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new OpenAiApiError(
					response.status,
					null,
					`OpenAI ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new OpenAiApiError(response.status, parsed, `OpenAI ${path} returned HTTP ${response.status}`);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

export class OpenAiApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'OpenAiApiError';
	}
}

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const composeSignals = (a: AbortSignal | undefined, b: AbortSignal): AbortSignal => {
	if (!a) return b;
	const controller = new AbortController();
	const onAbort = (): void => controller.abort();
	a.addEventListener('abort', onAbort, { once: true });
	b.addEventListener('abort', onAbort, { once: true });
	if (a.aborted || b.aborted) controller.abort();
	return controller.signal;
};
