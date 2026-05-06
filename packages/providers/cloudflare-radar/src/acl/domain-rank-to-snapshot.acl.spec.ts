import { describe, expect, it } from 'vitest';
import type { DomainRankResponse } from '../endpoints/domain-rank.js';
import { extractSnapshot } from './domain-rank-to-snapshot.acl.js';

const FALLBACK = new Date('2026-05-04T12:00:00Z');

describe('extractSnapshot (Cloudflare Radar domain-rank)', () => {
	it('parses rank, categories, bucket and meta.lastUpdated', () => {
		const response: DomainRankResponse = {
			success: true,
			result: {
				details_0: {
					rank: 142,
					domain: 'example.com',
					categories: [
						{ name: 'Technology', rank: 8 },
						{ name: 'Search Engines', rank: 3 },
					],
					bucket: '200',
				},
				meta: { lastUpdated: '2026-05-01T00:00:00Z' },
			},
		};
		const snap = extractSnapshot(response, FALLBACK);
		expect(snap.observedDate).toBe('2026-05-01');
		expect(snap.rank).toBe(142);
		expect(snap.bucket).toBe('200');
		expect(snap.categories).toEqual({ Technology: 8, 'Search Engines': 3 });
	});

	it('surfaces an unranked long-tail domain as rank: null without dropping the snapshot', () => {
		const response: DomainRankResponse = {
			success: true,
			result: {
				details_0: { domain: 'unknown-blog.example' },
				meta: { lastUpdated: '2026-05-01T00:00:00Z' },
			},
		};
		const snap = extractSnapshot(response, FALLBACK);
		expect(snap.rank).toBeNull();
		expect(snap.categories).toEqual({});
		expect(snap.bucket).toBeNull();
	});

	it('falls back to today when meta.lastUpdated is missing', () => {
		const response: DomainRankResponse = { success: true, result: { details_0: { rank: 1 } } };
		const snap = extractSnapshot(response, FALLBACK);
		expect(snap.observedDate).toBe('2026-05-04');
	});

	it('drops malformed category entries (non-finite rank, missing name)', () => {
		const response: DomainRankResponse = {
			success: true,
			result: {
				details_0: {
					rank: 100,
					categories: [
						{ name: 'OK', rank: 5 },
						{ name: 'Broken', rank: Number.NaN },
						{ rank: 7 }, // missing name
					],
				},
			},
		};
		const snap = extractSnapshot(response, FALLBACK);
		expect(snap.categories).toEqual({ OK: 5 });
	});
});
