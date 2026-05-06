/**
 * Minimal HTTP client for Google AI Studio's `generativelanguage.googleapis.com`
 * endpoints. Auth is via `x-goog-api-key` header (the alternative `?key=` query
 * param leaks the key into request logs / proxy access logs — header is the
 * sensible default).
 */

export interface GoogleAiStudioHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 60_000;

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class GoogleAiStudioHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: GoogleAiStudioHttpOptions = {}) {
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
					'x-goog-api-key': apiKey,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(body),
				signal: composedSignal,
			});
			const contentLength = response.headers.get('content-length');
			if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
				throw new GoogleAiStudioApiError(
					response.status,
					null,
					`Google AI Studio ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const text = await response.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				throw new GoogleAiStudioApiError(
					response.status,
					null,
					`Google AI Studio ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
				);
			}
			const parsed = text.length > 0 ? safeParse(text) : null;
			if (!response.ok) {
				throw new GoogleAiStudioApiError(
					response.status,
					parsed,
					`Google AI Studio ${path} returned HTTP ${response.status}`,
				);
			}
			return parsed;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

export class GoogleAiStudioApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'GoogleAiStudioApiError';
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
