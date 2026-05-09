import type { AclContext } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import type { RankedKeywordsResponse } from '../endpoints/ranked-keywords.js';
import { normaliseRankedKeywordsResponse } from './ranked-keywords-to-domain.acl.js';

const ctx = (overrides: Partial<AclContext> = {}): AclContext => ({
	dateBucket: '2026-05-09',
	systemParams: { targetDomain: 'controlrondas.com' },
	endpointParams: {},
	...overrides,
});

const fixture: RankedKeywordsResponse = {
	status_code: 20000,
	status_message: 'Ok.',
	cost: 0.01,
	tasks: [
		{
			status_code: 20000,
			status_message: 'Ok.',
			result: [
				{
					total_count: 2,
					items: [
						{
							keyword_data: {
								keyword: 'control de rondas',
								keyword_info: { search_volume: 720, cpc: 1.4, competition: 0.4 },
								keyword_properties: { keyword_difficulty: 22 },
							},
							ranked_serp_element: {
								serp_item: {
									rank_group: 4,
									rank_absolute: 5,
									url: 'https://controlrondas.com/precios',
									etv: 12.3,
								},
							},
						},
						{
							keyword_data: {
								keyword: 'app vigilantes',
								keyword_info: { search_volume: 90, cpc: null, competition: null },
								keyword_properties: { keyword_difficulty: null },
							},
							ranked_serp_element: {
								serp_item: { rank_group: 11, rank_absolute: 12, url: 'https://controlrondas.com/' },
							},
						},
						// Placeholder row without keyword — must be dropped.
						{ keyword_data: {} },
					],
				},
			],
		},
	],
};

describe('normaliseRankedKeywordsResponse', () => {
	it('projects each item into a RankedKeywordRow with rank_absolute preferred', () => {
		const rows = normaliseRankedKeywordsResponse(fixture, ctx());
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			keyword: 'control de rondas',
			position: 5,
			rankingUrl: 'https://controlrondas.com/precios',
			searchVolume: 720,
			keywordDifficulty: 22,
			trafficEstimate: 12.3,
			cpc: 1.4,
		});
		// Numeric fields fall back to null when DataForSEO returns null.
		expect(rows[1]).toMatchObject({ keyword: 'app vigilantes', cpc: null, keywordDifficulty: null });
	});

	it('throws when systemParams.targetDomain is missing or empty', () => {
		expect(() => normaliseRankedKeywordsResponse(fixture, ctx({ systemParams: {} }))).toThrow(/targetDomain/);
		expect(() =>
			normaliseRankedKeywordsResponse(fixture, ctx({ systemParams: { targetDomain: '' } })),
		).toThrow(/targetDomain/);
	});

	it('returns an empty array for an empty payload', () => {
		const empty: RankedKeywordsResponse = { status_code: 20000, status_message: 'Ok.', tasks: [] };
		expect(normaliseRankedKeywordsResponse(empty, ctx())).toEqual([]);
	});
});
