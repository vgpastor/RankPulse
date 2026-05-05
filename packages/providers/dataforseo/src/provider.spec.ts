import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import { DataForSeoProvider } from './provider.js';

const stubContext = (): FetchContext => ({
	credential: { plaintextSecret: 'foo@x.com|password' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('DataForSeoProvider', () => {
	it('exposes the SERP live endpoint via discover()', () => {
		const provider = new DataForSeoProvider();
		const ids = provider.discover().map((e) => e.id);
		expect(ids).toContain('serp-google-organic-live');
	});

	it('exposes the BACKLOG #19 endpoint catalogue (9 endpoints, no backlinks)', () => {
		const provider = new DataForSeoProvider();
		const ids = provider.discover().map((e) => e.id);
		expect(ids).toEqual(
			expect.arrayContaining([
				'serp-google-organic-live',
				'serp-google-organic-advanced',
				'keywords-data-search-volume',
				'dataforseo-labs-keyword-difficulty',
				'dataforseo-labs-keywords-for-site',
				'dataforseo-labs-related-keywords',
				'dataforseo-labs-competitors-domain',
				'domain-analytics-whois-overview',
				'on-page-instant-pages',
			]),
		);
		// Backlinks is the user-pending optional addon ($100/mo) — must NOT
		// appear until that subscription is active.
		expect(ids.some((id) => id.includes('backlinks'))).toBe(false);
	});

	it('every descriptor declares a non-empty defaultCron (BACKLOG #21)', () => {
		const provider = new DataForSeoProvider();
		for (const descriptor of provider.discover()) {
			expect(descriptor.defaultCron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
		}
	});

	it('validateCredentialPlaintext rejects the wrong separator', () => {
		const provider = new DataForSeoProvider();
		expect(() => provider.validateCredentialPlaintext('foo@x.com:password')).toThrow();
	});

	it('validateCredentialPlaintext accepts the email|password format', () => {
		const provider = new DataForSeoProvider();
		expect(() => provider.validateCredentialPlaintext('foo@x.com|secret')).not.toThrow();
	});

	it('rejects unknown endpoint ids', async () => {
		const provider = new DataForSeoProvider();
		await expect(provider.fetch('bogus', {}, stubContext())).rejects.toThrowError(/no endpoint/);
	});

	it('rejects malformed params with InvalidInputError', async () => {
		const provider = new DataForSeoProvider();
		await expect(
			provider.fetch('serp-google-organic-live', { keyword: '' }, stubContext()),
		).rejects.toThrow();
	});

	it('forwards properly shaped params to the underlying http call', async () => {
		let capturedBody: unknown[] | undefined;
		const fakeFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			void _url;
			capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
			return new Response(
				JSON.stringify({
					status_code: 20000,
					status_message: 'Ok.',
					tasks: [{ status_code: 20000, status_message: 'Ok.', result: [] }],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		};
		const provider = new DataForSeoProvider({ fetchImpl: fakeFetch as typeof fetch });
		await provider.fetch(
			'serp-google-organic-live',
			{ keyword: 'control de rondas', locationCode: 2724, languageCode: 'es', device: 'desktop', depth: 20 },
			stubContext(),
		);
		expect(capturedBody?.[0]).toMatchObject({
			keyword: 'control de rondas',
			location_code: 2724,
			language_code: 'es',
		});
	});
});
