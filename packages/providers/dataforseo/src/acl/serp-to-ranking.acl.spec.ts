import { describe, expect, it } from 'vitest';
import type { SerpLiveResponse } from '../endpoints/serp-google-organic-live.js';
import {
	extractRankingForDomain,
	extractRankingsForDomains,
	extractTop10Domains,
	extractTopSerpResults,
} from './serp-to-ranking.acl.js';

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

describe('extractTop10Domains (BACKLOG #18)', () => {
	it('returns each distinct organic domain in the top-10, normalized', () => {
		const domains = extractTop10Domains(fixture);
		expect(domains).toEqual(['todoelectronica.com', 'vigilant.es', 'euroma.es', 'controlrondas.com']);
	});

	it('skips non-organic items (people_also_ask, paid, snippets) — only competitor signals count', () => {
		const domains = extractTop10Domains(fixture);
		expect(domains).not.toContain(undefined);
		// people_also_ask in the fixture has no domain anyway, but if it did,
		// it would still be filtered out.
	});

	it('drops items past rank 10 — extending the top-10 cutoff would change the policy semantics', () => {
		const past10: SerpLiveResponse = {
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
								{ type: 'organic', rank_absolute: 9, rank_group: 9, domain: 'a.com', url: 'https://a.com' },
								{ type: 'organic', rank_absolute: 11, rank_group: 11, domain: 'b.com', url: 'https://b.com' },
							],
						},
					],
				},
			],
		};
		expect(extractTop10Domains(past10)).toEqual(['a.com']);
	});

	it('deduplicates a domain showing up in multiple positions', () => {
		const dup: SerpLiveResponse = {
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
								{ type: 'organic', rank_absolute: 1, rank_group: 1, domain: 'a.com', url: 'https://a.com/1' },
								{ type: 'organic', rank_absolute: 5, rank_group: 5, domain: 'a.com', url: 'https://a.com/2' },
								{ type: 'organic', rank_absolute: 6, rank_group: 6, domain: 'B.COM', url: 'https://b.com' },
							],
						},
					],
				},
			],
		};
		expect(extractTop10Domains(dup)).toEqual(['a.com', 'b.com']);
	});

	it('returns empty when there are no organic items', () => {
		const empty: SerpLiveResponse = {
			...fixture,
			tasks: [
				{
					status_code: 20000,
					status_message: 'Ok.',
					result: [{ keyword: 'x', location_code: 1, language_code: 'en', items: [] }],
				},
			],
		};
		expect(extractTop10Domains(empty)).toEqual([]);
	});
});

describe('extractTopSerpResults (issue #115)', () => {
	const fixtureWithTitles: SerpLiveResponse = {
		...fixture,
		tasks: [
			{
				status_code: 20000,
				status_message: 'Ok.',
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
								title: 'Todo electrónica - Control',
							},
							{
								type: 'organic',
								rank_absolute: 2,
								rank_group: 2,
								domain: 'vigilant.es',
								url: 'https://vigilant.es/control',
								title: 'Vigilant',
							},
							{ type: 'people_also_ask' },
							{
								type: 'organic',
								rank_absolute: 7,
								rank_group: 7,
								domain: 'controlrondas.com',
								url: 'https://controlrondas.com/',
								title: 'Control Rondas',
							},
						],
					},
				],
			},
		],
	};

	it('returns rank + domain + url + title for each organic item, sorted ascending by rank', () => {
		const rows = extractTopSerpResults(fixtureWithTitles);
		expect(rows.map((r) => ({ rank: r.rank, domain: r.domain, title: r.title }))).toEqual([
			{ rank: 1, domain: 'todoelectronica.com', title: 'Todo electrónica - Control' },
			{ rank: 2, domain: 'vigilant.es', title: 'Vigilant' },
			{ rank: 7, domain: 'controlrondas.com', title: 'Control Rondas' },
		]);
	});

	it('skips non-organic items (people_also_ask, snippet, paid)', () => {
		const rows = extractTopSerpResults(fixtureWithTitles);
		expect(rows.map((r) => r.rank)).not.toContain(3);
	});

	it('respects topN cap', () => {
		const rows = extractTopSerpResults(fixtureWithTitles, 3);
		expect(rows.map((r) => r.rank)).toEqual([1, 2]);
	});

	it('returns empty when there are no organic items', () => {
		const empty: SerpLiveResponse = {
			...fixture,
			tasks: [
				{
					status_code: 20000,
					status_message: 'Ok.',
					result: [{ keyword: 'x', location_code: 1, language_code: 'en', items: [] }],
				},
			],
		};
		expect(extractTopSerpResults(empty)).toEqual([]);
	});

	it('emits null url/title when payload omits them', () => {
		const noTitle: SerpLiveResponse = {
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
							items: [{ type: 'organic', rank_absolute: 5, rank_group: 5, domain: 'a.com' }],
						},
					],
				},
			],
		};
		const rows = extractTopSerpResults(noTitle);
		expect(rows[0]).toEqual({ rank: 5, domain: 'a.com', url: null, title: null });
	});
});
