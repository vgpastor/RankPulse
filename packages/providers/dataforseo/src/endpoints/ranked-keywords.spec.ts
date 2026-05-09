import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it, vi } from 'vitest';
import { DataForSeoApiError, DataForSeoHttp } from '../http.js';
import {
	buildRankedKeywordsBody,
	fetchRankedKeywords,
	type RankedKeywordsParams,
	type RankedKeywordsResponse,
} from './ranked-keywords.js';

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: 'user@example.com|secret-pwd' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-09T00:00:00Z'),
});

const params: RankedKeywordsParams = {
	target: 'controlrondas.com',
	locationCode: 2724,
	languageCode: 'es',
	limit: 100,
};

describe('buildRankedKeywordsBody', () => {
	it('serialises params to the DataForSEO snake_case body shape', () => {
		expect(buildRankedKeywordsBody(params)).toEqual([
			{
				target: 'controlrondas.com',
				location_code: 2724,
				language_code: 'es',
				limit: 100,
			},
		]);
	});
});

describe('fetchRankedKeywords', () => {
	it('returns the parsed payload on a 20000 task status', async () => {
		const response: RankedKeywordsResponse = {
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
		const result = await fetchRankedKeywords(http, params, ctx());
		expect(result.status_code).toBe(20000);
		// Verify the URL hit + body shape.
		const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
		expect(call?.[0]).toMatch(/\/v3\/dataforseo_labs\/google\/ranked_keywords\/live$/);
		expect(JSON.parse(String(call?.[1]?.body))).toEqual(buildRankedKeywordsBody(params));
	});

	it('throws DataForSeoApiError when the task status is an error code', async () => {
		const response: RankedKeywordsResponse = {
			status_code: 40402,
			status_message: 'No balance',
			tasks: [{ status_code: 40402, status_message: 'No balance' }],
		};
		const fetchImpl = vi.fn(
			async () => new Response(JSON.stringify(response), { status: 200 }),
		) as unknown as typeof fetch;
		const http = new DataForSeoHttp({ fetchImpl });
		await expect(fetchRankedKeywords(http, params, ctx())).rejects.toBeInstanceOf(DataForSeoApiError);
	});
});
