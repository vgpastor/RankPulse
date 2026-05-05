import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import { WikipediaProvider } from './provider.js';

const stubContext = (): FetchContext => ({
	credential: { plaintextSecret: 'public' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('WikipediaProvider', () => {
	it('exposes both endpoints via discover()', () => {
		const provider = new WikipediaProvider();
		const ids = provider.discover().map((e) => e.id);
		expect(ids).toEqual(
			expect.arrayContaining(['wikipedia-pageviews-per-article', 'wikipedia-top-articles']),
		);
	});

	it('every descriptor declares a non-empty defaultCron (BACKLOG #21)', () => {
		const provider = new WikipediaProvider();
		for (const descriptor of provider.discover()) {
			expect(descriptor.defaultCron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
		}
	});

	it('rejects unknown endpoint ids', async () => {
		const provider = new WikipediaProvider();
		await expect(provider.fetch('bogus', {}, stubContext())).rejects.toThrowError(/no endpoint/);
	});

	it('rejects malformed params with InvalidInputError', async () => {
		const provider = new WikipediaProvider();
		await expect(
			provider.fetch('wikipedia-pageviews-per-article', { project: '' }, stubContext()),
		).rejects.toThrow();
	});

	it('forwards a properly shaped request and returns the typed response', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = async (url: RequestInfo | URL): Promise<Response> => {
			capturedUrl = String(url);
			return new Response(
				JSON.stringify({
					items: [
						{
							project: 'es.wikipedia.org',
							article: 'Torre_Eiffel',
							granularity: 'daily',
							timestamp: '2026010100',
							access: 'all-access',
							agent: 'user',
							views: 1500,
						},
					],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		};
		const provider = new WikipediaProvider({ fetchImpl: fakeFetch as typeof fetch });
		const result = (await provider.fetch(
			'wikipedia-pageviews-per-article',
			{
				project: 'es.wikipedia.org',
				article: 'Torre_Eiffel',
				access: 'all-access',
				agent: 'user',
				granularity: 'daily',
				start: '20260101',
				end: '20260131',
			},
			stubContext(),
		)) as { items: Array<{ views: number }> };

		expect(capturedUrl).toContain('/metrics/pageviews/per-article/es.wikipedia.org/');
		expect(capturedUrl).toContain('/Torre_Eiffel/daily/20260101/20260131');
		expect(result.items[0]?.views).toBe(1500);
	});

	it('top-articles endpoint URL includes year/month/day path segments', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = async (url: RequestInfo | URL): Promise<Response> => {
			capturedUrl = String(url);
			return new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		};
		const provider = new WikipediaProvider({ fetchImpl: fakeFetch as typeof fetch });
		await provider.fetch(
			'wikipedia-top-articles',
			{ project: 'en.wikipedia.org', access: 'all-access', year: '2026', month: '05', day: '01' },
			stubContext(),
		);
		expect(capturedUrl).toContain('/metrics/pageviews/top/en.wikipedia.org/all-access/2026/05/01');
	});
});
