import { describe, expect, it } from 'vitest';
import type { RunPagespeedResponse } from '../endpoints/runpagespeed.js';
import { extractSnapshot } from './psi-to-snapshot.acl.js';

const NOW = new Date('2026-05-04T10:00:00Z');

describe('extractSnapshot', () => {
	it('returns all-null when payload has neither field nor lab data', () => {
		const out = extractSnapshot({}, NOW);
		expect(out.lcpMs).toBeNull();
		expect(out.cls).toBeNull();
		expect(out.performanceScore).toBeNull();
		expect(out.observedAt).toBe(NOW);
	});

	it('uses analysisUTCTimestamp when present, fallback to now() otherwise', () => {
		const withTs = extractSnapshot({ analysisUTCTimestamp: '2026-05-01T08:00:00Z' }, NOW);
		expect(withTs.observedAt.toISOString()).toBe('2026-05-01T08:00:00.000Z');
		const withoutTs = extractSnapshot({}, NOW);
		expect(withoutTs.observedAt).toBe(NOW);
	});

	it('falls back to now() if analysisUTCTimestamp is malformed', () => {
		const out = extractSnapshot({ analysisUTCTimestamp: 'not-a-date' }, NOW);
		expect(out.observedAt).toBe(NOW);
	});

	it('reads CrUX field metrics from loadingExperience preferentially', () => {
		const payload: RunPagespeedResponse = {
			loadingExperience: {
				metrics: {
					LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400 },
					INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
					CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 }, // CrUX returns CLS×100
				},
			},
		};
		const out = extractSnapshot(payload, NOW);
		expect(out.lcpMs).toBe(2400);
		expect(out.inpMs).toBe(180);
		expect(out.cls).toBeCloseTo(0.05, 5);
	});

	it('falls back to originLoadingExperience when URL-level metrics are missing (low-traffic page)', () => {
		const payload: RunPagespeedResponse = {
			originLoadingExperience: {
				metrics: {
					LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3000 },
				},
			},
		};
		const out = extractSnapshot(payload, NOW);
		expect(out.lcpMs).toBe(3000);
	});

	it('reads Lighthouse category scores (0-1)', () => {
		const payload: RunPagespeedResponse = {
			lighthouseResult: {
				categories: {
					performance: { score: 0.92 },
					seo: { score: 1.0 },
					accessibility: { score: 0.88 },
					'best-practices': { score: 0.75 },
				},
			},
		};
		const out = extractSnapshot(payload, NOW);
		expect(out.performanceScore).toBe(0.92);
		expect(out.seoScore).toBe(1);
		expect(out.accessibilityScore).toBe(0.88);
		expect(out.bestPracticesScore).toBe(0.75);
	});

	it('treats non-finite percentiles as null (PSI returns null when bucket is empty)', () => {
		const payload: RunPagespeedResponse = {
			loadingExperience: {
				metrics: {
					LARGEST_CONTENTFUL_PAINT_MS: { percentile: Number.NaN },
				},
			},
		};
		expect(extractSnapshot(payload, NOW).lcpMs).toBeNull();
	});

	it('treats lighthouse score=null (audit not run) as null in the snapshot', () => {
		const payload: RunPagespeedResponse = {
			lighthouseResult: {
				categories: {
					performance: { score: null },
				},
			},
		};
		expect(extractSnapshot(payload, NOW).performanceScore).toBeNull();
	});
});
