import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it, vi } from 'vitest';
import { DataForSeoApiError, DataForSeoHttp } from '../http.js';
import {
	buildDomainIntersectionBody,
	type DomainIntersectionParams,
	type DomainIntersectionResponse,
	fetchDomainIntersection,
} from './domain-intersection.js';

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: 'user@example.com|secret-pwd' },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-09T00:00:00Z'),
});

const params: DomainIntersectionParams = {
	targets: ['rondacontrol.es', 'controlrondas.com'],
	locationCode: 2724,
	languageCode: 'es',
	intersectionMode: 'one_intersect',
	limit: 100,
};

describe('buildDomainIntersectionBody', () => {
	it('serialises params to the DataForSEO snake_case body shape with targets order preserved', () => {
		expect(buildDomainIntersectionBody(params)).toEqual([
			{
				targets: ['rondacontrol.es', 'controlrondas.com'],
				location_code: 2724,
				language_code: 'es',
				intersection_mode: 'one_intersect',
				limit: 100,
			},
		]);
	});
});

describe('fetchDomainIntersection', () => {
	it('returns the parsed payload on a 20000 task status', async () => {
		const response: DomainIntersectionResponse = {
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
		const result = await fetchDomainIntersection(http, params, ctx());
		expect(result.status_code).toBe(20000);
		const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
		expect(call?.[0]).toMatch(/\/v3\/dataforseo_labs\/google\/domain_intersection\/live$/);
		expect(JSON.parse(String(call?.[1]?.body))).toEqual(buildDomainIntersectionBody(params));
	});

	it('throws DataForSeoApiError when the task status is an error code', async () => {
		const response: DomainIntersectionResponse = {
			status_code: 40402,
			status_message: 'No balance',
			tasks: [{ status_code: 40402, status_message: 'No balance' }],
		};
		const fetchImpl = vi.fn(
			async () => new Response(JSON.stringify(response), { status: 200 }),
		) as unknown as typeof fetch;
		const http = new DataForSeoHttp({ fetchImpl });
		await expect(fetchDomainIntersection(http, params, ctx())).rejects.toBeInstanceOf(DataForSeoApiError);
	});
});
