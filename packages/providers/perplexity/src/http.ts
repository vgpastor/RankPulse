/**
 * Minimal HTTP client for Perplexity's chat-completions endpoint. Perplexity
 * speaks an OpenAI-compatible REST API on a different host, so the surface
 * here is essentially a relabelled OpenAI client (Bearer auth + JSON body).
 */

export interface PerplexityHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_TIMEOUT_MS = 60_000;

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class PerplexityHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: PerplexityHttpOptions = {}) {
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
				throw new PerplexityApiError(
					response.status,
					null,
					`Perplexity ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new PerplexityApiError(
					response.status,
					null,
					`Perplexity ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new PerplexityApiError(
					response.status,
					parsed,
					`Perplexity ${path} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

export class PerplexityApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'PerplexityApiError';
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
