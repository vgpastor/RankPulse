import type { DataExportResponse } from '../endpoints/data-export.js';

export interface ClarityMetricsSnapshot {
	observedDate: string; // YYYY-MM-DD — supplied by the caller (Clarity's response is span-of-days)
	sessionsCount: number;
	botSessionsCount: number;
	distinctUserCount: number;
	pagesPerSession: number;
	rageClicks: number;
	deadClicks: number;
	avgEngagementSeconds: number;
	avgScrollDepth: number;
}

const toFinite = (raw: unknown): number => {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw === 'string') {
		const n = Number(raw);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
};

const findMetric = (response: DataExportResponse, metricName: string): number => {
	const entry = response.find((e) => e.metricName === metricName);
	if (!entry || !entry.information || entry.information.length === 0) return 0;
	const first = entry.information[0];
	if (!first) return 0;
	// Information items use the metric name as a key. We try several
	// known shapes (Microsoft's response varies by metric):
	const candidates = [first[metricName], first.value, first.Total, first.totalSessionsCount];
	for (const c of candidates) {
		if (c !== undefined) return toFinite(c);
	}
	// Fallback: first numeric-typed entry in the information row.
	for (const v of Object.values(first)) {
		if (typeof v === 'number' && Number.isFinite(v)) return v;
	}
	return 0;
};

/**
 * Pure ACL: Clarity Data Export response → a single typed snapshot row.
 * The response groups metrics under `metricName` keys; we reduce to one
 * row keyed on `observedDate` (the cron's wall-clock date — Clarity
 * returns aggregated metrics over the requested window, not per-day,
 * so the caller stamps the date).
 */
export const extractSnapshot = (
	response: DataExportResponse,
	observedDate: string,
): ClarityMetricsSnapshot => {
	return {
		observedDate,
		sessionsCount: findMetric(response, 'Traffic'),
		botSessionsCount: findMetric(response, 'BotSessions'),
		distinctUserCount: findMetric(response, 'DistinctUsers'),
		pagesPerSession: findMetric(response, 'PagesPerSession'),
		rageClicks: findMetric(response, 'RageClicks'),
		deadClicks: findMetric(response, 'DeadClicks'),
		avgEngagementSeconds: findMetric(response, 'EngagementTime'),
		avgScrollDepth: findMetric(response, 'ScrollDepth'),
	};
};
