import { describe, expect, it } from 'vitest';
import type { RunReportResponse } from '../endpoints/run-report.js';
import { extractRows } from './run-report-to-rows.acl.js';

const fixture: RunReportResponse = {
	dimensionHeaders: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }, { name: 'country' }],
	metricHeaders: [
		{ name: 'sessions', type: 'TYPE_INTEGER' },
		{ name: 'totalUsers', type: 'TYPE_INTEGER' },
		{ name: 'engagementRate', type: 'TYPE_FLOAT' },
	],
	rows: [
		{
			dimensionValues: [{ value: '20260501' }, { value: 'Organic Search' }, { value: 'Spain' }],
			metricValues: [{ value: '1240' }, { value: '982' }, { value: '0.6132' }],
		},
		{
			dimensionValues: [{ value: '20260502' }, { value: 'Direct' }, { value: 'Mexico' }],
			metricValues: [{ value: '88' }, { value: '74' }, { value: '0.4318' }],
		},
	],
	rowCount: 2,
};

describe('extractRows', () => {
	it('projects dimension values by header name', () => {
		const rows = extractRows(fixture, { startDate: '2026-05-01', endDate: '2026-05-02' });
		expect(rows).toHaveLength(2);
		expect(rows[0]?.dimensions).toEqual({
			date: '2026-05-01',
			sessionDefaultChannelGroup: 'Organic Search',
			country: 'Spain',
		});
		expect(rows[1]?.dimensions.country).toBe('Mexico');
	});

	it('coerces metric strings to numbers', () => {
		const rows = extractRows(fixture, { startDate: '2026-05-01', endDate: '2026-05-02' });
		expect(rows[0]?.metrics).toEqual({ sessions: 1240, totalUsers: 982, engagementRate: 0.6132 });
		expect(rows[1]?.metrics.sessions).toBe(88);
	});

	it('expands GA4 compact YYYYMMDD into ISO calendar dates', () => {
		const rows = extractRows(fixture, { startDate: '2026-05-01', endDate: '2026-05-02' });
		expect(rows[0]?.observedDate).toBe('2026-05-01');
		expect(rows[1]?.observedDate).toBe('2026-05-02');
	});

	it('falls back to endDate when no date dimension is requested', () => {
		const noDate: RunReportResponse = {
			dimensionHeaders: [{ name: 'country' }],
			metricHeaders: [{ name: 'sessions' }],
			rows: [{ dimensionValues: [{ value: 'Spain' }], metricValues: [{ value: '5' }] }],
		};
		const rows = extractRows(noDate, { startDate: '2026-05-01', endDate: '2026-05-07' });
		expect(rows[0]?.observedDate).toBe('2026-05-07');
		expect(rows[0]?.dimensions).toEqual({ country: 'Spain' });
	});

	it('returns empty when GA4 had no traffic in the window', () => {
		expect(extractRows({}, { startDate: '2026-05-01', endDate: '2026-05-02' })).toEqual([]);
	});

	it('treats missing/non-numeric metric values as 0 rather than NaN', () => {
		const messy: RunReportResponse = {
			dimensionHeaders: [{ name: 'date' }],
			metricHeaders: [{ name: 'sessions' }, { name: 'totalUsers' }],
			rows: [
				{
					dimensionValues: [{ value: '20260501' }],
					metricValues: [{ value: '' }, { value: 'not-a-number' }],
				},
				{ dimensionValues: [{ value: '20260502' }], metricValues: [{}, { value: undefined }] },
			],
		};
		const rows = extractRows(messy, { startDate: '2026-05-01', endDate: '2026-05-02' });
		expect(rows[0]?.metrics).toEqual({ sessions: 0, totalUsers: 0 });
		expect(rows[1]?.metrics).toEqual({ sessions: 0, totalUsers: 0 });
	});

	it('preserves already-ISO date dimensions without re-formatting', () => {
		const isoDate: RunReportResponse = {
			dimensionHeaders: [{ name: 'date' }],
			metricHeaders: [{ name: 'sessions' }],
			rows: [{ dimensionValues: [{ value: '2026-05-01' }], metricValues: [{ value: '7' }] }],
		};
		const rows = extractRows(isoDate, { startDate: '2026-05-01', endDate: '2026-05-01' });
		expect(rows[0]?.observedDate).toBe('2026-05-01');
	});
});
