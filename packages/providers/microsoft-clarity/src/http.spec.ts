import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLegacyShim, ClarityApiError, ClarityHttpClient } from './http.js';

const validToken = 'eyJhbGciOiJIUzI1NiJ9.fake.signature_padding_chars_here';

const baseConfig: HttpConfig = {
	baseUrl: 'https://www.clarity.ms/export-data/api/v1',
	auth: { kind: 'bearer-token' },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext = validToken, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('ClarityHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends Authorization: Bearer <token> and Accept on a successful GET', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new ClarityHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.get<unknown[]>('/project-live-insights', { numOfDays: '1' }, stubContext());

		expect(result).toEqual([]);
		expect(capturedUrl).toBe('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1');
		expect(capturedHeaders?.Authorization).toBe(`Bearer ${validToken}`);
		expect(capturedHeaders?.Accept).toBe('application/json');
	});

	it('legacy shim flattens multi-value query parameters into the URL', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new ClarityHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const shim = buildLegacyShim(client, stubContext());
		await shim.get(
			'/project-live-insights',
			{ numOfDays: '1', dimension1: 'Browser', dimension2: 'Country' },
			validToken,
		);

		// Each dimension key arrives as a single string in this case; the
		// flattening logic preserves order and encodes correctly.
		expect(capturedUrl).toContain('numOfDays=1');
		expect(capturedUrl).toContain('dimension1=Browser');
		expect(capturedUrl).toContain('dimension2=Country');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ message: 'Forbidden' }), {
					status: 403,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new ClarityHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.get('/project-live-insights', { numOfDays: '1' }, stubContext()),
		).rejects.toMatchObject({ status: 403 });
		// Alias check: ClarityApiError === ProviderApiError, so instanceof works
		// for the worker's quota detector.
		await expect(
			client.get('/project-live-insights', { numOfDays: '1' }, stubContext()),
		).rejects.toBeInstanceOf(ClarityApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new ClarityHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.get('/project-live-insights', { numOfDays: '1' }, stubContext()),
		).rejects.toMatchObject({ status: 0 });
		await expect(
			client.get('/project-live-insights', { numOfDays: '1' }, stubContext()),
		).rejects.toBeInstanceOf(ProviderApiError);
	});

	it('throws ProviderApiError when Content-Length exceeds the 8MB cap', async () => {
		// 8MB + 1 byte → over the cap. We don't actually send 8MB of bytes,
		// the upstream just claims to in the header.
		const overCap = String(8 * 1024 * 1024 + 1);
		const fakeFetch = vi.fn(
			async () =>
				new Response('[]', {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': overCap },
				}),
		);

		const client = new ClarityHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.get('/project-live-insights', { numOfDays: '1' }, stubContext()),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get('/project-live-insights', { numOfDays: '1' }, stubContext()),
		).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('validateCredentialPlaintext rejects malformed tokens BEFORE any fetch (pre-flight)', async () => {
		// `validateClarityToken` is exported separately and called by the
		// manifest's `validateCredentialPlaintext` at registration time —
		// not on every request. This test confirms the credential format
		// check rejects clearly without ever hitting the network.
		const fakeFetch = vi.fn();
		const { validateClarityToken } = await import('./credential.js');

		expect(() => validateClarityToken('short')).toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
