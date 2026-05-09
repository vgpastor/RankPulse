import type { AclContext } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import type { DomainIntersectionResponse } from '../endpoints/domain-intersection.js';
import { normaliseDomainIntersectionResponse } from './domain-intersection-to-domain.acl.js';

const ctx = (overrides: Partial<AclContext> = {}): AclContext => ({
	dateBucket: '2026-05-09',
	systemParams: { ourDomain: 'controlrondas.com', competitorDomain: 'rondacontrol.es' },
	endpointParams: {},
	...overrides,
});

const fixture: DomainIntersectionResponse = {
	status_code: 20000,
	status_message: 'Ok.',
	cost: 0.02,
	tasks: [
		{
			status_code: 20000,
			status_message: 'Ok.',
			result: [
				{
					total_count: 3,
					items: [
						// Gap proper — competitor ranks, we don't.
						{
							keyword_data: {
								keyword: 'control de rondas',
								keyword_info: { search_volume: 720, cpc: 1.4, competition: 0.4 },
								keyword_properties: { keyword_difficulty: 22 },
							},
							first_domain_serp_element: {
								rank_group: 4,
								rank_absolute: 4,
								url: 'https://rondacontrol.es/x',
							},
							second_domain_serp_element: null,
						},
						// Both rank — our position recorded.
						{
							keyword_data: {
								keyword: 'app vigilantes',
								keyword_info: { search_volume: 90, cpc: null, competition: null },
								keyword_properties: { keyword_difficulty: null },
							},
							first_domain_serp_element: { rank_group: 8, rank_absolute: 8 },
							second_domain_serp_element: { rank_group: 35, rank_absolute: 35 },
						},
						// Placeholder row without keyword — must be dropped.
						{ keyword_data: {} },
					],
				},
			],
		},
	],
};

describe('normaliseDomainIntersectionResponse', () => {
	it('projects each item into a DomainIntersectionRow with first→theirs / second→ours', () => {
		const rows = normaliseDomainIntersectionResponse(fixture, ctx());
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			keyword: 'control de rondas',
			ourPosition: null,
			theirPosition: 4,
			searchVolume: 720,
			cpc: 1.4,
			keywordDifficulty: 22,
		});
		expect(rows[1]).toMatchObject({
			keyword: 'app vigilantes',
			ourPosition: 35,
			theirPosition: 8,
			cpc: null,
			keywordDifficulty: null,
		});
	});

	it('throws when systemParams.ourDomain is missing or empty', () => {
		expect(() =>
			normaliseDomainIntersectionResponse(fixture, ctx({ systemParams: { competitorDomain: 'x.es' } })),
		).toThrow(/ourDomain/);
		expect(() =>
			normaliseDomainIntersectionResponse(
				fixture,
				ctx({ systemParams: { ourDomain: '', competitorDomain: 'x.es' } }),
			),
		).toThrow(/ourDomain/);
	});

	it('throws when systemParams.competitorDomain is missing or empty', () => {
		expect(() =>
			normaliseDomainIntersectionResponse(fixture, ctx({ systemParams: { ourDomain: 'a.com' } })),
		).toThrow(/competitorDomain/);
	});

	it('returns an empty array for an empty payload', () => {
		const empty: DomainIntersectionResponse = { status_code: 20000, status_message: 'Ok.', tasks: [] };
		expect(normaliseDomainIntersectionResponse(empty, ctx())).toEqual([]);
	});
});
