import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrevoApiError, BrevoHttpClient } from './http.js';

const validApiKey = 'xkeysib-1234567890abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const baseConfig: HttpConfig = {
	baseUrl: 'https://api.brevo.com/v3',
	auth: { kind: 'api-key-header', headerName: 'api-key' },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext = validApiKey, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('BrevoHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends api-key header (NOT Bearer) and Accept on a successful GET', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ campaigns: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new BrevoHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.get<{ campaigns: unknown[] }>(
			'/emailCampaigns',
			{ limit: '10' },
			stubContext(),
		);

		expect(result).toEqual({ campaigns: [] });
		expect(capturedUrl).toBe('https://api.brevo.com/v3/emailCampaigns?limit=10');
		expect(capturedHeaders?.['api-key']).toBe(validApiKey);
		expect(capturedHeaders?.Authorization).toBeUndefined();
		expect(capturedHeaders?.Accept).toBe('application/json');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ message: 'unauthorized' }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new BrevoHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/account', {}, stubContext())).rejects.toMatchObject({ status: 401 });
		// Alias check: BrevoApiError === ProviderApiError, so instanceof works
		// for any caller that wants to discriminate provider failures.
		await expect(client.get('/account', {}, stubContext())).rejects.toBeInstanceOf(BrevoApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new BrevoHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/account', {}, stubContext())).rejects.toMatchObject({ status: 0 });
		await expect(client.get('/account', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
	});

	it('throws ProviderApiError when Content-Length exceeds the 8MB cap', async () => {
		const overCap = String(8 * 1024 * 1024 + 1);
		const fakeFetch = vi.fn(
			async () =>
				new Response('{}', {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': overCap },
				}),
		);

		const client = new BrevoHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/account', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
		await expect(client.get('/account', {}, stubContext())).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('validateBrevoApiKey rejects malformed API keys BEFORE any fetch (pre-flight)', async () => {
		// `validateBrevoApiKey` is called by the manifest's
		// `validateCredentialPlaintext` at registration time. This test
		// confirms the credential format check rejects clearly without
		// ever hitting the network.
		const fakeFetch = vi.fn();
		const { validateBrevoApiKey } = await import('./credential.js');

		expect(() => validateBrevoApiKey('short')).toThrow(InvalidInputError);
		expect(() => validateBrevoApiKey('')).toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
