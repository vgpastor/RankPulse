import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryCompetitorRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordCompetitorWaybackSnapshotUseCase } from './record-competitor-wayback-snapshot.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const COMP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as ProjectManagement.CompetitorId;
const OBS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd' as Uuid;

class FakeActivityRepo implements ProjectManagement.CompetitorActivityObservationRepository {
	saved: ProjectManagement.CompetitorActivityObservation[] = [];
	async save(obs: ProjectManagement.CompetitorActivityObservation): Promise<void> {
		this.saved.push(obs);
	}
	async rollupForProject(): Promise<readonly ProjectManagement.CompetitorActivityRollupRow[]> {
		return [];
	}
}

describe('RecordCompetitorWaybackSnapshotUseCase', () => {
	let competitors: InMemoryCompetitorRepository;
	let activity: FakeActivityRepo;
	let useCase: RecordCompetitorWaybackSnapshotUseCase;

	beforeEach(async () => {
		competitors = new InMemoryCompetitorRepository();
		activity = new FakeActivityRepo();
		const clock = new FakeClock(new Date('2026-05-09T14:00:00Z'));
		const ids = new FixedIdGenerator([OBS_ID as Uuid]);
		useCase = new RecordCompetitorWaybackSnapshotUseCase(competitors, activity, clock, ids);
		await competitors.save(
			ProjectManagement.Competitor.add({
				id: COMP_ID,
				projectId: PROJECT_ID,
				domain: ProjectManagement.DomainName.create('silvertrac.com'),
				label: 'Silvertrac',
				now: new Date('2026-04-15T10:00:00Z'),
			}),
		);
	});

	it('persists a wayback observation truncated to start-of-day-UTC', async () => {
		await useCase.execute({
			competitorId: COMP_ID,
			rawPayloadId: null,
			summary: {
				snapshotCount: 12,
				latestSnapshotAt: '2026-05-08T16:30:00.000Z',
				earliestSnapshotAt: '2026-04-10T08:00:00.000Z',
			},
		});
		expect(activity.saved).toHaveLength(1);
		const obs = activity.saved[0];
		expect(obs?.source).toBe('wayback-cdx');
		expect(obs?.observedAt.toISOString()).toBe('2026-05-09T00:00:00.000Z');
		expect(obs?.wayback?.snapshotCount).toBe(12);
		expect(obs?.wayback?.latestSnapshotAt?.toISOString()).toBe('2026-05-08T16:30:00.000Z');
	});

	it('handles null timestamps in the summary', async () => {
		await useCase.execute({
			competitorId: COMP_ID,
			rawPayloadId: null,
			summary: { snapshotCount: 0, latestSnapshotAt: null, earliestSnapshotAt: null },
		});
		expect(activity.saved[0]?.wayback?.latestSnapshotAt).toBeNull();
		expect(activity.saved[0]?.wayback?.earliestSnapshotAt).toBeNull();
	});

	it('throws NotFoundError when the competitor does not exist', async () => {
		await expect(
			useCase.execute({
				competitorId: '99999999-9999-9999-9999-999999999999',
				rawPayloadId: null,
				summary: { snapshotCount: 0, latestSnapshotAt: null, earliestSnapshotAt: null },
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
