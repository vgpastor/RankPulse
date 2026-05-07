import { describe, expect, it, vi } from 'vitest';
import { ProviderApiError } from './error.js';
import { BaseHttpClient } from './http-base.js';
import type { HttpConfig } from './manifest.js';
import type { FetchContext } from './types.js';

class TestClient extends BaseHttpClient {
	protected override applyAuth(plaintextSecret: string): Record<string, string> {
		return { Authorization: `Bearer ${plaintextSecret}` };
	}
	protected override buildUrl(path: string, query: Record<string, string>): string {
		const qs = new URLSearchParams(query).toString();
		return `${this.config.baseUrl}${path}${qs ? `?${qs}` : ''}`;
	}
}

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: 'secret' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-06T00:00:00Z'),
});

const config: HttpConfig = {
	baseUrl: 'https://api.example.com',
	auth: { kind: 'bearer-token' },
	defaultTimeoutMs: 5_000,
};

describe('BaseHttpClient', () => {
	it('GET applies auth, returns parsed JSON', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const client = new TestClient('test', config);
		const result = await client.get<{ ok: boolean }>('/endpoint', { q: '1' }, ctx());
		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledOnce();
		const firstCall = fetchMock.mock.calls[0];
		if (!firstCall) throw new Error('fetch was not called');
		const [url, init] = firstCall;
		expect(url).toBe('https://api.example.com/endpoint?q=1');
		expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer secret' });
		fetchMock.mockRestore();
	});

	it('non-2xx response throws ProviderApiError with status + body + providerId', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('upstream said no', { status: 429 }));
		const client = new TestClient('test', config);
		await expect(client.get('/endpoint', {}, ctx())).rejects.toMatchObject({
			name: 'ProviderApiError',
			providerId: 'test',
			status: 429,
			body: 'upstream said no',
		});
		fetchMock.mockRestore();
	});

	it('non-JSON 2xx body throws ProviderApiError', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }),
			);
		const client = new TestClient('test', config);
		await expect(client.get('/endpoint', {}, ctx())).rejects.toBeInstanceOf(ProviderApiError);
		fetchMock.mockRestore();
	});

	it('network error throws ProviderApiError with status 0', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
		const client = new TestClient('test', config);
		await expect(client.get('/endpoint', {}, ctx())).rejects.toMatchObject({
			providerId: 'test',
			status: 0,
		});
		fetchMock.mockRestore();
	});

	it('caller AbortSignal aborts the request', async () => {
		const controller = new AbortController();
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
			const signal = (init as RequestInit).signal as AbortSignal;
			return new Promise((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			});
		});
		const client = new TestClient('test', config);
		const promise = client.get('/endpoint', {}, { ...ctx(), signal: controller.signal });
		controller.abort();
		await expect(promise).rejects.toBeInstanceOf(ProviderApiError);
		fetchMock.mockRestore();
	});
});
