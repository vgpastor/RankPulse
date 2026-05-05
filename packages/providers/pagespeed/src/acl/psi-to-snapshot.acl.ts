import type { RunPagespeedResponse } from '../endpoints/runpagespeed.js';

/**
 * Domain-shaped snapshot of a PSI run, ready to persist as one row in
 * the time-series. Combines the field-metric percentiles (CrUX, what
 * Google ranks against) with the lab-metric scores (Lighthouse).
 *
 * All numeric fields are nullable because PSI returns null/missing
 * for URLs without enough CrUX data (cold pages, internal admin
 * dashboards, sites that opted out). We persist what we got — the
 * read model can decide how to render gaps.
 */
export interface PageSpeedSnapshotExtraction {
	observedAt: Date;
	// CrUX field metrics (75th percentile, real users)
	lcpMs: number | null;
	inpMs: number | null;
	cls: number | null;
	fcpMs: number | null;
	ttfbMs: number | null;
	// Lighthouse lab scores (0-1, multiply by 100 for the typical UI display)
	performanceScore: number | null;
	seoScore: number | null;
	accessibilityScore: number | null;
	bestPracticesScore: number | null;
}

const FIELD_METRIC_KEYS = {
	lcp: 'LARGEST_CONTENTFUL_PAINT_MS',
	inp: 'INTERACTION_TO_NEXT_PAINT',
	cls: 'CUMULATIVE_LAYOUT_SHIFT_SCORE',
	fcp: 'FIRST_CONTENTFUL_PAINT_MS',
	ttfb: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE',
} as const;

/**
 * Both `loadingExperience.metrics` and `originLoadingExperience.metrics`
 * carry entries with `percentile?: number`. We only read that one field
 * so a structural type covers both shapes.
 */
type PercentileMetrics = Record<string, { percentile?: number } | undefined>;

const readPercentile = (metrics: PercentileMetrics | undefined, key: string, scale = 1): number | null => {
	const raw = metrics?.[key]?.percentile;
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
	return raw / scale;
};

const readScore = (
	categories: NonNullable<NonNullable<RunPagespeedResponse['lighthouseResult']>['categories']>,
	key: string,
): number | null => {
	const raw = categories[key]?.score;
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
	return raw;
};

/**
 * Pure ACL: PSI v5 payload → typed snapshot. Falls back to
 * originLoadingExperience when the URL-level loadingExperience is
 * missing (low-traffic page that doesn't have its own CrUX bucket;
 * Google rolls up to origin in that case).
 */
export const extractSnapshot = (payload: RunPagespeedResponse, now: Date): PageSpeedSnapshotExtraction => {
	const observedAt = payload.analysisUTCTimestamp ? new Date(payload.analysisUTCTimestamp) : now;
	const fieldMetrics = payload.loadingExperience?.metrics ?? payload.originLoadingExperience?.metrics ?? {};
	const categories = payload.lighthouseResult?.categories ?? {};

	return {
		observedAt: Number.isFinite(observedAt.getTime()) ? observedAt : now,
		lcpMs: readPercentile(fieldMetrics, FIELD_METRIC_KEYS.lcp),
		inpMs: readPercentile(fieldMetrics, FIELD_METRIC_KEYS.inp),
		// CLS comes back as integer * 100 in CrUX (a CLS of 0.1 → percentile 10)
		cls: readPercentile(fieldMetrics, FIELD_METRIC_KEYS.cls, 100),
		fcpMs: readPercentile(fieldMetrics, FIELD_METRIC_KEYS.fcp),
		ttfbMs: readPercentile(fieldMetrics, FIELD_METRIC_KEYS.ttfb),
		performanceScore: readScore(categories, 'performance'),
		seoScore: readScore(categories, 'seo'),
		accessibilityScore: readScore(categories, 'accessibility'),
		bestPracticesScore: readScore(categories, 'best-practices'),
	};
};
