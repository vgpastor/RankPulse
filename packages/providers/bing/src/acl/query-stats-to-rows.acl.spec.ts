import { describe, expect, it } from 'vitest';
import type { QueryStatsResponse } from '../endpoints/query-stats.js';
import { extractQueryRows } from './query-stats-to-rows.acl.js';

describe('extractQueryRows (Bing query-stats)', () => {
	it('projects per-query rows with trimmed query text', () => {
		const fixture: QueryStatsResponse = {
			d: [
				{ Query: '  control de rondas  ', Clicks: 50, Impressions: 1200, AvgClickPosition: 5.2 },
				{ Query: 'app rondas', Clicks: 30, Impressions: 800, AvgImpressionPosition: 12.4 },
			],
		};
		const rows = extractQueryRows(fixture);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.query).toBe('control de rondas');
		expect(rows[0]?.clicks).toBe(50);
		expect(rows[1]?.avgImpressionPosition).toBe(12.4);
	});

	it('drops rows with empty/whitespace queries (would collide on the natural key)', () => {
		const fixture: QueryStatsResponse = {
			d: [
				{ Query: '', Clicks: 1, Impressions: 1 },
				{ Query: '   ', Clicks: 2, Impressions: 2 },
				{ Query: 'real query', Clicks: 3, Impressions: 3 },
			],
		};
		expect(extractQueryRows(fixture)).toHaveLength(1);
		expect(extractQueryRows(fixture)[0]?.query).toBe('real query');
	});

	it('returns empty when Bing payload has no `d` array', () => {
		expect(extractQueryRows({})).toEqual([]);
		expect(extractQueryRows({ d: [] })).toEqual([]);
	});
});
