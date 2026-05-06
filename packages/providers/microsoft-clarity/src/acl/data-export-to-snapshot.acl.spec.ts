import { describe, expect, it } from 'vitest';
import type { DataExportResponse } from '../endpoints/data-export.js';
import { extractSnapshot } from './data-export-to-snapshot.acl.js';

describe('extractSnapshot (Clarity data-export)', () => {
	it('reduces the metricName-keyed response into a single typed snapshot', () => {
		const response: DataExportResponse = [
			{ metricName: 'Traffic', information: [{ Traffic: 12_500 }] },
			{ metricName: 'BotSessions', information: [{ BotSessions: 1_200 }] },
			{ metricName: 'DistinctUsers', information: [{ DistinctUsers: 8_400 }] },
			{ metricName: 'PagesPerSession', information: [{ PagesPerSession: 3.4 }] },
			{ metricName: 'RageClicks', information: [{ RageClicks: 47 }] },
			{ metricName: 'DeadClicks', information: [{ DeadClicks: 19 }] },
			{ metricName: 'EngagementTime', information: [{ EngagementTime: 142.7 }] },
			{ metricName: 'ScrollDepth', information: [{ ScrollDepth: 0.62 }] },
		];
		const snap = extractSnapshot(response, '2026-05-01');
		expect(snap).toEqual({
			observedDate: '2026-05-01',
			sessionsCount: 12_500,
			botSessionsCount: 1_200,
			distinctUserCount: 8_400,
			pagesPerSession: 3.4,
			rageClicks: 47,
			deadClicks: 19,
			avgEngagementSeconds: 142.7,
			avgScrollDepth: 0.62,
		});
	});

	it('returns 0 for missing metric entries rather than dropping the snapshot', () => {
		const partial: DataExportResponse = [
			{ metricName: 'Traffic', information: [{ Traffic: 100 }] },
			// All other metrics absent — Clarity sometimes omits them on
			// low-traffic days.
		];
		const snap = extractSnapshot(partial, '2026-05-02');
		expect(snap.sessionsCount).toBe(100);
		expect(snap.rageClicks).toBe(0);
		expect(snap.avgScrollDepth).toBe(0);
	});

	it('coerces string-typed numeric values (Microsoft sometimes emits strings)', () => {
		const stringy: DataExportResponse = [
			{ metricName: 'Traffic', information: [{ Traffic: '2500' }] },
			{ metricName: 'RageClicks', information: [{ RageClicks: 'not-a-number' }] },
		];
		const snap = extractSnapshot(stringy, '2026-05-03');
		expect(snap.sessionsCount).toBe(2500);
		expect(snap.rageClicks).toBe(0);
	});

	it('falls back to known alternate keys (value / Total) when the metric-named key is absent', () => {
		const altShape: DataExportResponse = [
			{ metricName: 'Traffic', information: [{ value: 9000 }] },
			{ metricName: 'RageClicks', information: [{ Total: 13 }] },
		];
		const snap = extractSnapshot(altShape, '2026-05-04');
		expect(snap.sessionsCount).toBe(9000);
		expect(snap.rageClicks).toBe(13);
	});

	it('returns all-zero counts for an empty response (auth or fresh-project edge case)', () => {
		const snap = extractSnapshot([], '2026-05-05');
		expect(snap.observedDate).toBe('2026-05-05');
		expect(snap.sessionsCount).toBe(0);
		expect(snap.distinctUserCount).toBe(0);
	});
});
