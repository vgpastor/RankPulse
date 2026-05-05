import { describe, expect, it } from 'vitest';
import type { SerpLiveResponse } from '../endpoints/serp-google-organic-live.js';
import { extractRankingForDomain, extractRankingsForDomains } from './serp-to-ranking.acl.js';

const fixture: SerpLiveResponse = {
	status_code: 20000,
	status_message: 'Ok.',
	cost: 0.0035,
	tasks: [
		{
			status_code: 20000,
			status_message: 'Ok.',
			cost: 0.0035,
			result: [
				{
					keyword: 'control de rondas',
					location_code: 2724,
					language_code: 'es',
					items: [
						{
							type: 'organic',
							rank_absolute: 1,
							rank_group: 1,
							domain: 'todoelectronica.com',
							url: 'https://todoelectronica.com/',
						},
						{
							type: 'organic',
							rank_absolute: 2,
							rank_group: 2,
							domain: 'vigilant.es',
							url: 'https://vigilant.es/control',
						},
						{
							type: 'organic',
							rank_absolute: 3,
							rank_group: 3,
							domain: 'euroma.es',
							url: 'https://euroma.es',
						},
						{ type: 'people_also_ask' },
						{
							type: 'organic',
							rank_absolute: 7,
							rank_group: 7,
							domain: 'controlrondas.com',
							url: 'https://controlrondas.com/',
						},
					],
				},
			],
		},
	],
};

describe('extractRankingForDomain', () => {
	it('finds the absolute rank of the queried domain', () => {
		const result = extractRankingForDomain(fixture, 'controlrondas.com');
		expect(result.position).toBe(7);
		expect(result.url).toBe('https://controlrondas.com/');
	});

	it('returns null when the domain is absent from the SERP', () => {
		const result = extractRankingForDomain(fixture, 'patroltech.online');
		expect(result.position).toBeNull();
		expect(result.url).toBeNull();
	});

	it('matches subdomains of the requested domain', () => {
		const subdomainFixture: SerpLiveResponse = {
			...fixture,
			tasks: [
				{
					status_code: 20000,
					status_message: 'Ok.',
					result: [
						{
							keyword: 'x',
							location_code: 1,
							language_code: 'en',
							items: [
								{
									type: 'organic',
									rank_absolute: 4,
									rank_group: 4,
									domain: 'shop.controlrondas.com',
									url: 'https://shop.controlrondas.com/x',
								},
							],
						},
					],
				},
			],
		};
		expect(extractRankingForDomain(subdomainFixture, 'controlrondas.com').position).toBe(4);
	});

	it('aggregates non-organic SERP feature types', () => {
		const result = extractRankingForDomain(fixture, 'controlrondas.com');
		expect(result.serpFeatures).toContain('people_also_ask');
	});
});

describe('extractRankingsForDomains (BACKLOG #12 + #15)', () => {
	it('returns one extraction per requested domain in a single pass — N domains × 1 SERP, not N SERPs', () => {
		const result = extractRankingsForDomains(fixture, [
			'todoelectronica.com',
			'vigilant.es',
			'controlrondas.com',
			'patroltech.online',
		]);

		expect(result.get('todoelectronica.com')?.position).toBe(1);
		expect(result.get('vigilant.es')?.position).toBe(2);
		expect(result.get('controlrondas.com')?.position).toBe(7);
		// Domain absent from the SERP → null position, but key still present.
		expect(result.has('patroltech.online')).toBe(true);
		expect(result.get('patroltech.online')?.position).toBeNull();
	});

	it('every extraction shares the same SERP features (features describe the SERP, not the domain)', () => {
		const result = extractRankingsForDomains(fixture, ['todoelectronica.com', 'vigilant.es']);
		expect(result.get('todoelectronica.com')?.serpFeatures).toEqual(['people_also_ask']);
		expect(result.get('vigilant.es')?.serpFeatures).toEqual(['people_also_ask']);
	});

	it('matches subdomains for each requested target', () => {
		const subdomainFixture: SerpLiveResponse = {
			...fixture,
			tasks: [
				{
					status_code: 20000,
					status_message: 'Ok.',
					result: [
						{
							keyword: 'x',
							location_code: 1,
							language_code: 'en',
							items: [
								{
									type: 'organic',
									rank_absolute: 4,
									rank_group: 4,
									domain: 'shop.controlrondas.com',
									url: 'https://shop.controlrondas.com/x',
								},
								{
									type: 'organic',
									rank_absolute: 9,
									rank_group: 9,
									domain: 'blog.patroltech.online',
									url: 'https://blog.patroltech.online/y',
								},
							],
						},
					],
				},
			],
		};
		const result = extractRankingsForDomains(subdomainFixture, ['controlrondas.com', 'patroltech.online']);
		expect(result.get('controlrondas.com')?.position).toBe(4);
		expect(result.get('patroltech.online')?.position).toBe(9);
	});

	it('normalizes input domains (case + leading www.) so duplicate keys collapse', () => {
		const result = extractRankingsForDomains(fixture, ['Vigilant.ES', 'www.vigilant.es']);
		// Both inputs collapse to the same key — Map.set just overwrites, the
		// second call still gets a valid extraction.
		expect(result.get('vigilant.es')?.position).toBe(2);
	});
});
