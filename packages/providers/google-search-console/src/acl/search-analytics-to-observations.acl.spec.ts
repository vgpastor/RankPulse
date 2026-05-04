import { describe, expect, it } from 'vitest';
import type { SearchAnalyticsResponse } from '../endpoints/search-analytics.js';
import { extractGscRows } from './search-analytics-to-observations.acl.js';

const fixture: SearchAnalyticsResponse = {
	responseAggregationType: 'auto',
	rows: [
		{
			keys: ['2026-05-01', 'control de rondas', 'esp', 'desktop'],
			clicks: 12,
			impressions: 340,
			ctr: 0.035,
			position: 7.4,
		},
		{
			keys: ['2026-05-02', 'app control de rondas', 'mex', 'mobile'],
			clicks: 5,
			impressions: 120,
			ctr: 0.041,
			position: 4.1,
		},
	],
};

describe('extractGscRows', () => {
	it('projects keys onto named dimensions following the request order', () => {
		const rows = extractGscRows(fixture, {
			dimensions: ['date', 'query', 'country', 'device'],
			startDate: '2026-05-01',
			endDate: '2026-05-02',
		});
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			query: 'control de rondas',
			country: 'esp',
			device: 'desktop',
			clicks: 12,
			impressions: 340,
		});
		expect(rows[0]?.observedAt.toISOString()).toBe('2026-05-01T00:00:00.000Z');
		expect(rows[1]?.country).toBe('mex');
	});

	it('falls back to endDate when no date dimension is requested', () => {
		const noDateFixture: SearchAnalyticsResponse = {
			rows: [{ keys: ['only-query'], clicks: 1, impressions: 2, ctr: 0.5, position: 9 }],
		};
		const rows = extractGscRows(noDateFixture, {
			dimensions: ['query'],
			startDate: '2026-05-01',
			endDate: '2026-05-07',
		});
		expect(rows[0]?.observedAt.toISOString()).toBe('2026-05-07T00:00:00.000Z');
		expect(rows[0]?.query).toBe('only-query');
	});

	it('returns an empty array when the response has no rows', () => {
		expect(
			extractGscRows({}, { dimensions: ['date'], startDate: '2026-05-01', endDate: '2026-05-02' }),
		).toEqual([]);
	});
});
