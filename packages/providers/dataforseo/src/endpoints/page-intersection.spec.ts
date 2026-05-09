import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it, vi } from 'vitest';
import { DataForSeoApiError, DataForSeoHttp } from '../http.js';
import {
	buildPageIntersectionBody,
	fetchPageIntersection,
	PageIntersectionParams,
	type PageIntersectionResponse,
} from './page-intersection.js';

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: 'user@example.com|secret-pwd' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-09T00:00:00Z'),
});

const params: PageIntersectionParams = {
	pages: { 'controlrondas.com': ['rondas de vigilancia', 'control de rondas'] },
	keywords: ['rondas de vigilancia'],
	locationCode: 2724,
	languageCode: 'es',
	intersections: 1,
	limit: 100,
};

describe('buildPageIntersectionBody', () => {
	it('serialises params to the DataForSEO snake_case body shape', () => {
		expect(buildPageIntersectionBody(params)).toEqual([
			{
				pages: { 'controlrondas.com': ['rondas de vigilancia', 'control de rondas'] },
				keywords: ['rondas de vigilancia'],
				location_code: 2724,
				language_code: 'es',
				intersections: 1,
				limit: 100,
			},
		]);
	});

	it('omits optional pages/keywords when not provided', () => {
		const onlyKeywords: PageIntersectionParams = {
			keywords: ['rondas de vigilancia'],
			locationCode: 2724,
			languageCode: 'es',
			intersections: 2,
			limit: 50,
		};
		expect(buildPageIntersectionBody(onlyKeywords)).toEqual([
			{
				keywords: ['rondas de vigilancia'],
				location_code: 2724,
				language_code: 'es',
				intersections: 2,
				limit: 50,
			},
		]);
	});
});

describe('PageIntersectionParams refinement', () => {
	it('rejects when neither `pages` nor `keywords` is provided', () => {
		const result = PageIntersectionParams.safeParse({
			locationCode: 2724,
			languageCode: 'es',
		});
		expect(result.success).toBe(false);
	});

	it('accepts when only `keywords` is provided', () => {
		const result = PageIntersectionParams.safeParse({
			keywords: ['rondas de vigilancia'],
			locationCode: 2724,
			languageCode: 'es',
		});
		expect(result.success).toBe(true);
	});

	it('accepts when only `pages` is provided', () => {
		const result = PageIntersectionParams.safeParse({
			pages: { 'controlrondas.com': ['rondas'] },
			locationCode: 2724,
			languageCode: 'es',
		});
		expect(result.success).toBe(true);
	});
});

describe('fetchPageIntersection', () => {
	it('returns the parsed payload on a 20000 task status', async () => {
		const response: PageIntersectionResponse = {
			status_code: 20000,
			status_message: 'Ok.',
			tasks: [{ status_code: 20000, status_message: 'Ok.', result: [{ total_count: 0, items: [] }] }],
		};
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify(response), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		) as unknown as typeof fetch;
		const http = new DataForSeoHttp({ fetchImpl });
		const result = await fetchPageIntersection(http, params, ctx());
		expect(result.status_code).toBe(20000);
		const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
		expect(call?.[0]).toMatch(/\/v3\/dataforseo_labs\/google\/page_intersection\/live$/);
		expect(JSON.parse(String(call?.[1]?.body))).toEqual(buildPageIntersectionBody(params));
	});

	it('throws DataForSeoApiError when the task status is an error code', async () => {
		const response: PageIntersectionResponse = {
			status_code: 40402,
			status_message: 'No balance',
			tasks: [{ status_code: 40402, status_message: 'No balance' }],
		};
		const fetchImpl = vi.fn(
			async () => new Response(JSON.stringify(response), { status: 200 }),
		) as unknown as typeof fetch;
		const http = new DataForSeoHttp({ fetchImpl });
		await expect(fetchPageIntersection(http, params, ctx())).rejects.toBeInstanceOf(DataForSeoApiError);
	});
});
