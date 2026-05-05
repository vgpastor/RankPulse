import { describe, expect, it } from 'vitest';
import type { RankAndTrafficStatsResponse } from '../endpoints/rank-and-traffic-stats.js';
import { extractDailyRows } from './rank-traffic-to-rows.acl.js';

const fixture: RankAndTrafficStatsResponse = {
	d: [
		{
			Date: '/Date(1714521600000)/', // 2024-05-01 UTC
			Clicks: 120,
			Impressions: 4500,
			AvgClickPosition: 8.4,
			AvgImpressionPosition: 18.7,
		},
		{
			Date: '/Date(1714608000000)/', // 2024-05-02 UTC
			Clicks: 88,
			Impressions: 3200,
			AvgClickPosition: 9.1,
			AvgImpressionPosition: 19.5,
		},
	],
};

describe('extractDailyRows (Bing rank-and-traffic-stats)', () => {
	it("parses Microsoft's /Date(<ms>)/ wrapper into ISO YYYY-MM-DD", () => {
		const rows = extractDailyRows(fixture);
		expect(rows[0]?.observedDate).toBe('2024-05-01');
		expect(rows[1]?.observedDate).toBe('2024-05-02');
	});

	it('projects clicks / impressions / avg positions verbatim', () => {
		const rows = extractDailyRows(fixture);
		expect(rows[0]).toMatchObject({
			clicks: 120,
			impressions: 4500,
			avgClickPosition: 8.4,
			avgImpressionPosition: 18.7,
		});
	});

	it('drops rows with a malformed /Date(...)/ wrapper rather than synthesising a fallback', () => {
		const messy: RankAndTrafficStatsResponse = {
			d: [
				{ Date: 'not-a-bing-date', Clicks: 5, Impressions: 50 },
				{ Date: '/Date(NaN)/', Clicks: 5, Impressions: 50 },
				{ Date: '/Date(1714521600000)/', Clicks: 1, Impressions: 10 },
			],
		};
		expect(extractDailyRows(messy)).toEqual([
			{
				observedDate: '2024-05-01',
				clicks: 1,
				impressions: 10,
				avgClickPosition: null,
				avgImpressionPosition: null,
			},
		]);
	});

	it('coerces missing/non-finite numeric fields to 0 (counts) and null (positions)', () => {
		const messy: RankAndTrafficStatsResponse = {
			d: [
				{
					Date: '/Date(1714521600000)/',
					Clicks: undefined,
					Impressions: Number.NaN,
					AvgClickPosition: -1, // negative is nonsense for a position; drop
					AvgImpressionPosition: undefined,
				},
			],
		};
		expect(extractDailyRows(messy)[0]).toEqual({
			observedDate: '2024-05-01',
			clicks: 0,
			impressions: 0,
			avgClickPosition: null,
			avgImpressionPosition: null,
		});
	});

	it('returns empty when Bing payload has no `d` array (auth or empty-account edge case)', () => {
		expect(extractDailyRows({})).toEqual([]);
		expect(extractDailyRows({ d: [] })).toEqual([]);
	});
});
