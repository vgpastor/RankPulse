import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaApiError, MetaHttpClient } from './http.js';

const validToken = 'EAA' + 'x'.repeat(60);

const baseConfig: HttpConfig = {
	baseUrl: 'https://graph.facebook.com/v21.0',
	auth: { kind: 'custom', sign: (req) => req },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext = validToken, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('MetaHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('appends ?access_token=<token> to the URL on a successful GET', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new MetaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.get<{ data: unknown[] }>(
			'/act_123/insights',
			{ level: 'campaign' },
			stubContext(),
		);

		expect(result).toEqual({ data: [] });
		expect(capturedUrl).toContain('https://graph.facebook.com/v21.0/act_123/insights');
		expect(capturedUrl).toContain('level=campaign');
		expect(capturedUrl).toContain(`access_token=${validToken}`);
		// Auth via query param, NOT a header
		expect(capturedHeaders?.Authorization).toBeUndefined();
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'invalid_token' } }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new MetaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/me', {}, stubContext())).rejects.toMatchObject({ status: 401 });
		// Alias check: MetaApiError === ProviderApiError, so instanceof works
		// for the worker's quota detector at provider-fetch.processor.ts:143.
		await expect(client.get('/me', {}, stubContext())).rejects.toBeInstanceOf(MetaApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new MetaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/me', {}, stubContext())).rejects.toMatchObject({ status: 0 });
		await expect(client.get('/me', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
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

		const client = new MetaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/me', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
		await expect(client.get('/me', {}, stubContext())).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('rejects malformed access tokens BEFORE any fetch (pre-flight)', async () => {
		const fakeFetch = vi.fn();

		const client = new MetaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		// `validateMetaAccessToken` throws InvalidInputError on a token shorter
		// than the minimum length / not matching the EAA prefix; the override
		// validates BEFORE any network call so a malformed creds problem does
		// not consume rate-limit budget.
		await expect(client.get('/me', {}, stubContext('short'))).rejects.toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
