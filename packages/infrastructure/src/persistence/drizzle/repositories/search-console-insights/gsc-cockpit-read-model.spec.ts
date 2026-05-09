import type { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDatabase } from '../../client.js';
import { DrizzleGscCockpitReadModel } from './gsc-cockpit-read-model.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

const stubDbReturning = (rows: unknown[]): DrizzleDatabase => {
	const execute = vi.fn().mockResolvedValue(rows);
	return { execute } as unknown as DrizzleDatabase;
};

describe('DrizzleGscCockpitReadModel', () => {
	// postgres-js (3.4.x) returns timestamptz as ISO strings — not Date —
	// for raw `db.execute()` queries. The two methods below feed those
	// values to use cases that call `.toISOString()` / `.getTime()`, so
	// the repo MUST coerce. Regression guard for issue #148.
	describe('weeklyClicksByQuery', () => {
		it('coerces string week_start columns to Date', async () => {
			const db = stubDbReturning([
				{ week_start: '2026-04-27 00:00:00+00', query: 'guard tour', clicks: '50', impressions: '1000' },
				{ week_start: '2026-05-04 00:00:00+00', query: 'patroltech', clicks: '100', impressions: '500' },
			]);
			const repo = new DrizzleGscCockpitReadModel(db);
			const out = await repo.weeklyClicksByQuery(PROJECT_ID, 28);
			expect(out).toHaveLength(2);
			expect(out[0]?.weekStart).toBeInstanceOf(Date);
			expect(out[0]?.weekStart.toISOString()).toBe('2026-04-27T00:00:00.000Z');
			expect(out[1]?.weekStart.toISOString()).toBe('2026-05-04T00:00:00.000Z');
			expect(out[0]?.clicks).toBe(50);
			expect(out[1]?.impressions).toBe(500);
		});

		it('passes Date instances through unchanged', async () => {
			const date = new Date('2026-04-27T00:00:00.000Z');
			const db = stubDbReturning([{ week_start: date, query: 'q', clicks: 10, impressions: 100 }]);
			const repo = new DrizzleGscCockpitReadModel(db);
			const [row] = await repo.weeklyClicksByQuery(PROJECT_ID, 28);
			expect(row?.weekStart).toBe(date);
		});
	});

	describe('dailyTotalsForProject', () => {
		it('coerces string day columns to Date', async () => {
			const db = stubDbReturning([
				{ day: '2026-04-29 00:00:00+00', clicks: '50', impressions: '1000' },
				{ day: '2026-05-05 00:00:00+00', clicks: '30', impressions: '800' },
			]);
			const repo = new DrizzleGscCockpitReadModel(db);
			const out = await repo.dailyTotalsForProject(PROJECT_ID, 90);
			expect(out).toHaveLength(2);
			expect(out[0]?.day).toBeInstanceOf(Date);
			expect(out[0]?.day.toISOString()).toBe('2026-04-29T00:00:00.000Z');
			expect(out[1]?.day.toISOString()).toBe('2026-05-05T00:00:00.000Z');
			expect(out[0]?.clicks).toBe(50);
			expect(out[1]?.impressions).toBe(800);
		});

		it('handles null clicks/impressions defensively', async () => {
			const db = stubDbReturning([{ day: '2026-04-29 00:00:00+00', clicks: null, impressions: null }]);
			const repo = new DrizzleGscCockpitReadModel(db);
			const [row] = await repo.dailyTotalsForProject(PROJECT_ID, 90);
			expect(row?.clicks).toBe(0);
			expect(row?.impressions).toBe(0);
		});
	});
});
