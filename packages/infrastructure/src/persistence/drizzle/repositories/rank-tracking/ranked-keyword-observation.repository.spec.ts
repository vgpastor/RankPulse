import type { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDatabase } from '../../client.js';
import { DrizzleRankedKeywordObservationRepository } from './ranked-keyword-observation.repository.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

const stubDbReturning = (rows: unknown[]): DrizzleDatabase => {
	const execute = vi.fn().mockResolvedValue(rows);
	return { execute } as unknown as DrizzleDatabase;
};

describe('DrizzleRankedKeywordObservationRepository.aggregateMonthlyVolumeForProject', () => {
	// postgres-js (3.4.x) returns timestamptz as ISO strings — not Date —
	// for raw `db.execute()` queries. `QuerySearchDemandTrendUseCase` calls
	// `.toISOString()` on `month`, so the repo MUST coerce. Regression guard
	// for issue #178 (500 INTERNAL on /cockpit/search-demand-trend).
	it('coerces string month columns to Date', async () => {
		const db = stubDbReturning([
			{ month: '2026-04-01 00:00:00+00', total_volume: '1500', distinct_keywords: 17 },
			{ month: '2026-05-01 00:00:00+00', total_volume: '2000', distinct_keywords: 20 },
		]);
		const repo = new DrizzleRankedKeywordObservationRepository(db);
		const out = await repo.aggregateMonthlyVolumeForProject(PROJECT_ID, { months: 13 });
		expect(out).toHaveLength(2);
		expect(out[0]?.month).toBeInstanceOf(Date);
		expect(out[0]?.month.toISOString()).toBe('2026-04-01T00:00:00.000Z');
		expect(out[1]?.month.toISOString()).toBe('2026-05-01T00:00:00.000Z');
		expect(out[0]?.totalVolume).toBe(1500);
		expect(out[1]?.distinctKeywords).toBe(20);
	});

	it('passes Date instances through unchanged', async () => {
		const date = new Date('2026-04-01T00:00:00.000Z');
		const db = stubDbReturning([{ month: date, total_volume: 100, distinct_keywords: 1 }]);
		const repo = new DrizzleRankedKeywordObservationRepository(db);
		const [row] = await repo.aggregateMonthlyVolumeForProject(PROJECT_ID, { months: 13 });
		expect(row?.month).toBe(date);
	});

	it('handles null volume/count defensively', async () => {
		const db = stubDbReturning([
			{ month: '2026-04-01 00:00:00+00', total_volume: null, distinct_keywords: null },
		]);
		const repo = new DrizzleRankedKeywordObservationRepository(db);
		const [row] = await repo.aggregateMonthlyVolumeForProject(PROJECT_ID, { months: 13 });
		expect(row?.totalVolume).toBe(0);
		expect(row?.distinctKeywords).toBe(0);
	});

	it('returns empty array when query has no rows', async () => {
		const db = stubDbReturning([]);
		const repo = new DrizzleRankedKeywordObservationRepository(db);
		const out = await repo.aggregateMonthlyVolumeForProject(PROJECT_ID, { months: 13 });
		expect(out).toEqual([]);
	});
});
