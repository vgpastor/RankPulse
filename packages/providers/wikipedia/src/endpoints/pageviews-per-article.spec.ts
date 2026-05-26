import type { FetchContext } from '@rankpulse/provider-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WikipediaHttp } from '../http.js';
import { fetchPageviewsPerArticle, type PageviewsPerArticleResponse } from './pageviews-per-article.js';

/**
 * Captures the path of the last HTTP call so tests can assert on the
 * EXACT URL segments sent to Wikimedia. Returns an empty `items` array
 * by default — tests can override `responseBody`.
 */
class RecordingWikipediaHttp implements Pick<WikipediaHttp, 'get'> {
	lastPath: string | null = null;
	responseBody: unknown = { items: [] };

	async get(path: string, _signal?: AbortSignal): Promise<unknown> {
		this.lastPath = path;
		return this.responseBody;
	}
}

const fakeCtx = (): FetchContext => ({
	credential: { plaintextSecret: 'public' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-26T00:00:00Z'),
});

describe('fetchPageviewsPerArticle — wire-format guarantees', () => {
	let http: RecordingWikipediaHttp;

	beforeEach(() => {
		http = new RecordingWikipediaHttp();
	});

	// Regression for #179 follow-up: the worker's `resolveDateTokens`
	// substitutes `{{today-N}}` with canonical ISO `YYYY-MM-DD`. Wikimedia's
	// pageviews REST endpoint embeds the dates as path segments and requires
	// `YYYYMMDD` — handing it `2026-02-25` returns 404 / empty items
	// silently, matching the same failure shape as the Wayback bug.
	it('converts ISO YYYY-MM-DD `start`/`end` to YYYYMMDD in the URL path', async () => {
		await fetchPageviewsPerArticle(
			http as unknown as WikipediaHttp,
			{
				project: 'en.wikipedia.org',
				article: 'Eiffel_Tower',
				access: 'all-access',
				agent: 'user',
				granularity: 'daily',
				start: '2026-02-25',
				end: '2026-05-26',
			},
			fakeCtx(),
		);
		expect(http.lastPath).toBe(
			'/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/Eiffel_Tower/daily/20260225/20260526',
		);
	});

	it('passes through `start`/`end` already in compact YYYYMMDD form unchanged (idempotent)', async () => {
		await fetchPageviewsPerArticle(
			http as unknown as WikipediaHttp,
			{
				project: 'en.wikipedia.org',
				article: 'Eiffel_Tower',
				access: 'all-access',
				agent: 'user',
				granularity: 'daily',
				start: '20260225',
				end: '20260526',
			},
			fakeCtx(),
		);
		expect(http.lastPath).toBe(
			'/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/Eiffel_Tower/daily/20260225/20260526',
		);
	});

	it('URL-encodes the article title (only its segment, not the dates)', async () => {
		await fetchPageviewsPerArticle(
			http as unknown as WikipediaHttp,
			{
				project: 'es.wikipedia.org',
				article: 'Torre Eiffel',
				access: 'all-access',
				agent: 'user',
				granularity: 'daily',
				start: '2026-02-25',
				end: '2026-05-26',
			},
			fakeCtx(),
		);
		// Article is URL-encoded; dates stay numeric.
		expect(http.lastPath).toContain('/Torre%20Eiffel/');
		expect(http.lastPath).toContain('/20260225/20260526');
	});

	it('returns the response as-is when shape is valid (ACL is a separate concern)', async () => {
		const payload: PageviewsPerArticleResponse = {
			items: [
				{
					project: 'en.wikipedia.org',
					article: 'Eiffel_Tower',
					granularity: 'daily',
					timestamp: '2026022500',
					access: 'all-access',
					agent: 'user',
					views: 1234,
				},
			],
		};
		http.responseBody = payload;
		const result = await fetchPageviewsPerArticle(
			http as unknown as WikipediaHttp,
			{
				project: 'en.wikipedia.org',
				article: 'Eiffel_Tower',
				access: 'all-access',
				agent: 'user',
				granularity: 'daily',
				start: '2026-02-25',
				end: '2026-05-26',
			},
			fakeCtx(),
		);
		expect(result).toEqual(payload);
	});

	it('returns `{ items: [] }` when upstream returns null/undefined (defensive)', async () => {
		http.responseBody = null;
		const result = await fetchPageviewsPerArticle(
			http as unknown as WikipediaHttp,
			{
				project: 'en.wikipedia.org',
				article: 'Eiffel_Tower',
				access: 'all-access',
				agent: 'user',
				granularity: 'daily',
				start: '2026-02-25',
				end: '2026-05-26',
			},
			fakeCtx(),
		);
		expect(result).toEqual({ items: [] });
	});
});
