import { type ProblemDetailsPayload, RankPulseApiError, RankPulseNetworkError } from './errors.js';

export interface HttpClientOptions {
	baseUrl: string;
	getAuthToken?: () => string | null | undefined;
	fetchImpl?: typeof fetch;
}

export interface RequestOptions {
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined | null>;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

const isProblemDetails = (value: unknown): value is ProblemDetailsPayload =>
	typeof value === 'object' && value !== null && typeof (value as ProblemDetailsPayload).status === 'number';

/**
 * Minimal typed fetch wrapper. Intentionally framework-agnostic: works in
 * browsers, Node, edge runtimes, React Native. Returns the parsed JSON body
 * or throws RankPulseApiError / RankPulseNetworkError.
 */
export class HttpClient {
	private readonly baseUrl: string;
	private readonly getAuthToken: () => string | null | undefined;
	private readonly fetchImpl: typeof fetch;

	constructor(options: HttpClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, '');
		this.getAuthToken = options.getAuthToken ?? (() => undefined);
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	get<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>('GET', path, options);
	}

	post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T> {
		return this.request<T>('POST', path, { ...options, body });
	}

	patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T> {
		return this.request<T>('PATCH', path, { ...options, body });
	}

	delete<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>('DELETE', path, options);
	}

	private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
		const url = new URL(`${this.baseUrl}${path}`);
		if (options.query) {
			for (const [key, value] of Object.entries(options.query)) {
				if (value !== undefined && value !== null) {
					url.searchParams.set(key, String(value));
				}
			}
		}

		const headers: Record<string, string> = {
			Accept: 'application/json',
			...(options.headers ?? {}),
		};
		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
		}
		const token = this.getAuthToken();
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		let response: Response;
		try {
			response = await this.fetchImpl(url, {
				method,
				headers,
				body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
				signal: options.signal,
				credentials: 'include',
			});
		} catch (err) {
			throw new RankPulseNetworkError(`Network error contacting ${url.toString()}`, { cause: err });
		}

		const text = await response.text();
		const parsed = text.length > 0 ? safeJsonParse(text) : undefined;

		if (!response.ok) {
			if (isProblemDetails(parsed)) {
				throw new RankPulseApiError(parsed);
			}
			throw new RankPulseApiError({
				type: 'about:blank',
				title: response.statusText || 'HTTP Error',
				status: response.status,
				detail: typeof parsed === 'string' ? parsed : text,
			});
		}

		return parsed as T;
	}
}

const safeJsonParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
