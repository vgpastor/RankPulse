import type { FetchContext } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { PageSpeedProvider } from './provider.js';

const validKey = 'AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxx';

const stubContext = (key = validKey): FetchContext => ({
	credential: { plaintextSecret: key },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('PageSpeedProvider', () => {
	it('exposes the runPagespeed endpoint', () => {
		const provider = new PageSpeedProvider();
		expect(provider.discover().map((e) => e.id)).toEqual(['psi-runpagespeed']);
	});

	it('every descriptor declares a non-empty defaultCron (BACKLOG #21)', () => {
		const provider = new PageSpeedProvider();
		for (const d of provider.discover()) {
			expect(d.defaultCron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
		}
	});

	it('rejects too-short API keys with InvalidInputError', () => {
		const provider = new PageSpeedProvider();
		expect(() => provider.validateCredentialPlaintext('short')).toThrow(InvalidInputError);
	});

	it('accepts a well-formed API key', () => {
		const provider = new PageSpeedProvider();
		expect(() => provider.validateCredentialPlaintext(validKey)).not.toThrow();
	});

	it('rejects unknown endpoint ids', async () => {
		const provider = new PageSpeedProvider();
		await expect(provider.fetch('bogus', {}, stubContext())).rejects.toThrow(/no endpoint/);
	});

	it('rejects malformed params with InvalidInputError', async () => {
		const provider = new PageSpeedProvider();
		await expect(provider.fetch('psi-runpagespeed', { url: 'not-a-url' }, stubContext())).rejects.toThrow();
	});

	it('forwards a properly shaped request and returns the typed response', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = async (url: RequestInfo | URL): Promise<Response> => {
			capturedUrl = String(url);
			return new Response(
				JSON.stringify({
					id: 'https://example.com/',
					analysisUTCTimestamp: '2026-05-04T09:00:00Z',
					lighthouseResult: { categories: { performance: { score: 0.9 } } },
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		};
		const provider = new PageSpeedProvider({ fetchImpl: fakeFetch as typeof fetch });
		const result = (await provider.fetch(
			'psi-runpagespeed',
			{ url: 'https://example.com', strategy: 'mobile' },
			stubContext(),
		)) as { id?: string };
		expect(capturedUrl).toContain('/pagespeedonline/v5/runPagespeed');
		expect(capturedUrl).toContain('url=https%3A%2F%2Fexample.com');
		expect(capturedUrl).toContain('strategy=mobile');
		expect(capturedUrl).toContain(`key=${validKey}`);
		expect(result.id).toBe('https://example.com/');
	});
});
