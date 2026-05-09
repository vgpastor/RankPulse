import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it, vi } from 'vitest';
import { DataForSeoApiError, DataForSeoHttp } from '../http.js';
import {
	buildHistoricalSerpsBody,
	fetchHistoricalSerps,
	type HistoricalSerpsParams,
	type HistoricalSerpsResponse,
} from './historical-serps.js';

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: 'user@example.com|secret-pwd' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-09T00:00:00Z'),
});

const params: HistoricalSerpsParams = {
	keyword: 'rondas de vigilancia',
	locationCode: 2724,
	languageCode: 'es',
	dateFrom: '2025-05-01',
	dateTo: '2026-05-01',
};

describe('buildHistoricalSerpsBody', () => {
	it('serialises params to the DataForSEO snake_case body shape', () => {
		expect(buildHistoricalSerpsBody(params)).toEqual([
			{
				keyword: 'rondas de vigilancia',
				location_code: 2724,
				language_code: 'es',
				date_from: '2025-05-01',
				date_to: '2026-05-01',
			},
		]);
	});

	it('omits optional date_from / date_to when not provided', () => {
		const minimal: HistoricalSerpsParams = {
			keyword: 'rondas de vigilancia',
			locationCode: 2724,
			languageCode: 'es',
		};
		expect(buildHistoricalSerpsBody(minimal)).toEqual([
			{
				keyword: 'rondas de vigilancia',
				location_code: 2724,
				language_code: 'es',
			},
		]);
	});
});

describe('fetchHistoricalSerps', () => {
	it('returns the parsed payload on a 20000 task status', async () => {
		const response: HistoricalSerpsResponse = {
			status_code: 20000,
			status_message: 'Ok.',
			tasks: [
				{
					status_code: 20000,
					status_message: 'Ok.',
					result: [{ keyword: 'rondas de vigilancia', items: [] }],
				},
			],
		};
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify(response), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		) as unknown as typeof fetch;
		const http = new DataForSeoHttp({ fetchImpl });
		const result = await fetchHistoricalSerps(http, params, ctx());
		expect(result.status_code).toBe(20000);
		const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
		expect(call?.[0]).toMatch(/\/v3\/dataforseo_labs\/google\/historical_serps\/live$/);
		expect(JSON.parse(String(call?.[1]?.body))).toEqual(buildHistoricalSerpsBody(params));
	});

	it('throws DataForSeoApiError when the task status is an error code', async () => {
		const response: HistoricalSerpsResponse = {
			status_code: 40402,
			status_message: 'No balance',
			tasks: [{ status_code: 40402, status_message: 'No balance' }],
		};
		const fetchImpl = vi.fn(
			async () => new Response(JSON.stringify(response), { status: 200 }),
		) as unknown as typeof fetch;
		const http = new DataForSeoHttp({ fetchImpl });
		await expect(fetchHistoricalSerps(http, params, ctx())).rejects.toBeInstanceOf(DataForSeoApiError);
	});
});
