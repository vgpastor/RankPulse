import { describe, expect, it } from 'vitest';
import type { SerpLiveResponse } from '../endpoints/serp-google-organic-live.js';
import { extractRankingForDomain } from './serp-to-ranking.acl.js';

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
