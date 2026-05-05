import { describe, expect, it } from 'vitest';
import type { PageviewsPerArticleResponse } from '../endpoints/pageviews-per-article.js';
import { extractPageviews } from './pageviews-to-observations.acl.js';

const baseItem = {
	project: 'es.wikipedia.org',
	article: 'Torre_Eiffel',
	access: 'all-access',
	agent: 'user',
	granularity: 'daily',
};

describe('extractPageviews', () => {
	it('parses YYYYMMDDHH timestamps to UTC midnight Date instances', () => {
		const payload: PageviewsPerArticleResponse = {
			items: [
				{ ...baseItem, timestamp: '2026010100', views: 1234 },
				{ ...baseItem, timestamp: '2026010200', views: 1100 },
			],
		};
		const out = extractPageviews(payload);
		expect(out).toHaveLength(2);
		expect(out[0]?.observedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
		expect(out[1]?.observedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
		expect(out[0]?.views).toBe(1234);
	});

	it('returns empty array when payload has no items', () => {
		expect(extractPageviews({})).toEqual([]);
		expect(extractPageviews({ items: [] })).toEqual([]);
	});

	it('drops items with malformed timestamp without throwing', () => {
		const payload: PageviewsPerArticleResponse = {
			items: [
				{ ...baseItem, timestamp: 'bogus', views: 100 },
				{ ...baseItem, timestamp: '20260101', views: 200 }, // 8 chars, also invalid
				{ ...baseItem, timestamp: '2026010100', views: 300 },
			],
		};
		expect(extractPageviews(payload).map((o) => o.views)).toEqual([300]);
	});

	it('drops items with negative or non-numeric views', () => {
		const payload: PageviewsPerArticleResponse = {
			items: [
				{ ...baseItem, timestamp: '2026010100', views: -5 },
				{ ...baseItem, timestamp: '2026010200', views: Number.NaN },
				{ ...baseItem, timestamp: '2026010300', views: 50 },
			],
		};
		expect(extractPageviews(payload).map((o) => o.views)).toEqual([50]);
	});

	it('rounds fractional view counts (some informational endpoints return non-integer)', () => {
		const payload: PageviewsPerArticleResponse = {
			items: [{ ...baseItem, timestamp: '2026010100', views: 100.7 }],
		};
		expect(extractPageviews(payload)[0]?.views).toBe(101);
	});

	it('rejects month/day out of range', () => {
		const payload: PageviewsPerArticleResponse = {
			items: [
				{ ...baseItem, timestamp: '2026130100', views: 10 }, // month 13
				{ ...baseItem, timestamp: '2026010000', views: 20 }, // day 0
				{ ...baseItem, timestamp: '2026010101', views: 30 }, // valid (hour 01)
			],
		};
		expect(extractPageviews(payload).map((o) => o.views)).toEqual([30]);
	});
});
