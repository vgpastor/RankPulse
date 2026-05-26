import type { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDatabase } from '../../client.js';
import { DrizzleCompetitorActivityObservationRepository } from './competitor-activity-observation.repository.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const COMP_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMP_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const stubDbReturning = (rows: unknown[]): DrizzleDatabase => {
	const execute = vi.fn().mockResolvedValue(rows);
	return { execute } as unknown as DrizzleDatabase;
};

describe('DrizzleCompetitorActivityObservationRepository.rollupForProject', () => {
	// postgres-js (3.4.x) returns timestamptz as ISO strings — not Date —
	// for raw `db.execute()` queries. `QueryCompetitorActivityUseCase`
	// calls `.toISOString()` on `latestObservedAt` and `latestSnapshotAt`,
	// so the repo MUST coerce. Regression guard for issue #179 (500
	// INTERNAL on /cockpit/competitor-activity).
	it('coerces string observed_at + wayback_latest_snapshot_at to Date', async () => {
		const db = stubDbReturning([
			{
				competitor_id: COMP_A,
				source: 'wayback-cdx',
				rank: 1,
				observed_at: '2026-05-09 12:00:00+00',
				wayback_snapshot_count: 50,
				wayback_latest_snapshot_at: '2026-05-08 16:30:00+00',
				backlinks_total: null,
				backlinks_referring_domains: null,
			},
			{
				competitor_id: COMP_A,
				source: 'wayback-cdx',
				rank: 2,
				observed_at: '2026-05-02 12:00:00+00',
				wayback_snapshot_count: 45,
				wayback_latest_snapshot_at: '2026-05-01 09:00:00+00',
				backlinks_total: null,
				backlinks_referring_domains: null,
			},
		]);
		const repo = new DrizzleCompetitorActivityObservationRepository(db);
		const out = await repo.rollupForProject(PROJECT_ID, 30);
		expect(out).toHaveLength(1);
		const rollup = out[0];
		expect(rollup?.latestObservedAt).toBeInstanceOf(Date);
		expect(rollup?.latestObservedAt?.toISOString()).toBe('2026-05-09T12:00:00.000Z');
		expect(rollup?.latestWayback?.latestSnapshotAt).toBeInstanceOf(Date);
		expect(rollup?.latestWayback?.latestSnapshotAt?.toISOString()).toBe('2026-05-08T16:30:00.000Z');
		expect(rollup?.latestWayback?.snapshotCount).toBe(50);
		expect(rollup?.priorWayback?.snapshotCount).toBe(45);
	});

	it('preserves Date instances unchanged when driver already returned Date', async () => {
		const observed = new Date('2026-05-09T12:00:00.000Z');
		const snapshot = new Date('2026-05-08T16:30:00.000Z');
		const db = stubDbReturning([
			{
				competitor_id: COMP_A,
				source: 'wayback-cdx',
				rank: 1,
				observed_at: observed,
				wayback_snapshot_count: 50,
				wayback_latest_snapshot_at: snapshot,
				backlinks_total: null,
				backlinks_referring_domains: null,
			},
		]);
		const repo = new DrizzleCompetitorActivityObservationRepository(db);
		const [rollup] = await repo.rollupForProject(PROJECT_ID, 30);
		expect(rollup?.latestObservedAt).toBe(observed);
		expect(rollup?.latestWayback?.latestSnapshotAt).toBe(snapshot);
	});

	it('handles null wayback_latest_snapshot_at gracefully', async () => {
		const db = stubDbReturning([
			{
				competitor_id: COMP_A,
				source: 'wayback-cdx',
				rank: 1,
				observed_at: '2026-05-09 12:00:00+00',
				wayback_snapshot_count: 50,
				wayback_latest_snapshot_at: null,
				backlinks_total: null,
				backlinks_referring_domains: null,
			},
		]);
		const repo = new DrizzleCompetitorActivityObservationRepository(db);
		const [rollup] = await repo.rollupForProject(PROJECT_ID, 30);
		expect(rollup?.latestWayback?.latestSnapshotAt).toBeNull();
	});

	it('aggregates wayback + backlinks for the same competitor', async () => {
		const db = stubDbReturning([
			{
				competitor_id: COMP_B,
				source: 'wayback-cdx',
				rank: 1,
				observed_at: '2026-05-09 12:00:00+00',
				wayback_snapshot_count: 100,
				wayback_latest_snapshot_at: '2026-05-08 00:00:00+00',
				backlinks_total: null,
				backlinks_referring_domains: null,
			},
			{
				competitor_id: COMP_B,
				source: 'dataforseo-backlinks',
				rank: 1,
				observed_at: '2026-05-09 12:00:00+00',
				wayback_snapshot_count: null,
				wayback_latest_snapshot_at: null,
				backlinks_total: 1234,
				backlinks_referring_domains: 56,
			},
		]);
		const repo = new DrizzleCompetitorActivityObservationRepository(db);
		const [rollup] = await repo.rollupForProject(PROJECT_ID, 30);
		expect(rollup?.latestWayback?.snapshotCount).toBe(100);
		expect(rollup?.latestBacklinks?.totalBacklinks).toBe(1234);
		expect(rollup?.latestBacklinks?.referringDomains).toBe(56);
	});

	it('returns empty array when query has no rows', async () => {
		const db = stubDbReturning([]);
		const repo = new DrizzleCompetitorActivityObservationRepository(db);
		expect(await repo.rollupForProject(PROJECT_ID, 30)).toEqual([]);
	});
});
