import type { RunReportParams, RunReportResponse } from '../endpoints/run-report.js';

/**
 * Domain-shaped row coming out of a `runReport` call. We keep dimensions
 * as a flexible JSON map (the user picks which ones at request time) and
 * metrics as a parallel JSON map of numbers — GA4 returns them as strings,
 * we coerce here so the read side and aggregations don't have to.
 *
 * `observedDate` is the calendar date this row belongs to when `date` is
 * one of the requested dimensions; otherwise the caller's `endDate` (the
 * snapshot's "as of" date).
 */
export interface NormalizedGa4Row {
	observedDate: string; // YYYY-MM-DD
	dimensions: Record<string, string>;
	metrics: Record<string, number>;
}

const isYyyyMmDd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const insertDate = (dateRaw: string): string => {
	// GA4 returns date dimension as YYYYMMDD. Split into YYYY-MM-DD so the
	// downstream side never has to know about that compact form.
	if (isYyyyMmDd(dateRaw)) return dateRaw;
	if (/^\d{8}$/.test(dateRaw)) return `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
	return dateRaw;
};

const toNumber = (raw: string | undefined): number => {
	if (raw === undefined || raw === null || raw === '') return 0;
	const n = Number(raw);
	return Number.isFinite(n) ? n : 0;
};

/**
 * Pure ACL: GA4 v1beta `runReport` payload -> normalized rows.
 *
 * Headers tell us the order of dimensions/metrics; we project values by
 * name so callers don't index by position. If GA4 returns no rows
 * (no traffic in the window), we return an empty array — never null.
 */
export const extractRows = (
	response: RunReportResponse,
	params: Pick<RunReportParams, 'startDate' | 'endDate'>,
): NormalizedGa4Row[] => {
	const dimensionHeaders = response.dimensionHeaders ?? [];
	const metricHeaders = response.metricHeaders ?? [];
	const rows = response.rows ?? [];
	const fallbackDate = isYyyyMmDd(params.endDate) ? params.endDate : '';

	return rows.map((row) => {
		const dims: Record<string, string> = {};
		dimensionHeaders.forEach((h, idx) => {
			const value = row.dimensionValues?.[idx]?.value;
			if (typeof value !== 'string') return;
			// Normalize the canonical `date` dimension upfront so callers see one
			// shape regardless of GA4's compact YYYYMMDD return format.
			dims[h.name] = h.name === 'date' ? insertDate(value) : value;
		});
		const mets: Record<string, number> = {};
		metricHeaders.forEach((h, idx) => {
			mets[h.name] = toNumber(row.metricValues?.[idx]?.value);
		});
		const observedDate = dims.date ?? fallbackDate;
		return { observedDate, dimensions: dims, metrics: mets };
	});
};
