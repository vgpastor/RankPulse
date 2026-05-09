import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryCompetitorRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordCompetitorBacklinksProfileUseCase } from './record-competitor-backlinks-profile.use-case.js';

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

describe('RecordCompetitorBacklinksProfileUseCase', () => {
	let competitors: InMemoryCompetitorRepository;
	let activity: FakeActivityRepo;
	let useCase: RecordCompetitorBacklinksProfileUseCase;

	beforeEach(async () => {
		competitors = new InMemoryCompetitorRepository();
		activity = new FakeActivityRepo();
		const clock = new FakeClock(new Date('2026-05-09T14:00:00Z'));
		const ids = new FixedIdGenerator([OBS_ID as Uuid]);
		useCase = new RecordCompetitorBacklinksProfileUseCase(competitors, activity, clock, ids);
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

	it('persists a backlinks observation tagged with the dataforseo source', async () => {
		await useCase.execute({
			competitorId: COMP_ID,
			rawPayloadId: 'pp-1',
			summary: {
				totalBacklinks: 12000,
				referringDomains: 800,
				referringMainDomains: 600,
				referringPages: 4000,
				brokenBacklinks: 12,
				spamScore: 4,
				rank: 580,
			},
		});
		expect(activity.saved).toHaveLength(1);
		const obs = activity.saved[0];
		expect(obs?.source).toBe('dataforseo-backlinks');
		expect(obs?.backlinks?.totalBacklinks).toBe(12000);
		expect(obs?.backlinks?.referringDomains).toBe(800);
		expect(obs?.backlinks?.spamScore).toBe(4);
		expect(obs?.rawPayloadId).toBe('pp-1');
	});

	it('truncates observedAt to start-of-day-UTC for idempotent re-runs', async () => {
		await useCase.execute({
			competitorId: COMP_ID,
			rawPayloadId: null,
			summary: {
				totalBacklinks: 1,
				referringDomains: 1,
				referringMainDomains: 1,
				referringPages: 1,
				brokenBacklinks: 0,
				spamScore: null,
				rank: null,
			},
		});
		expect(activity.saved[0]?.observedAt.toISOString()).toBe('2026-05-09T00:00:00.000Z');
	});

	it('throws NotFoundError when the competitor does not exist', async () => {
		await expect(
			useCase.execute({
				competitorId: '99999999-9999-9999-9999-999999999999',
				rawPayloadId: null,
				summary: {
					totalBacklinks: 0,
					referringDomains: 0,
					referringMainDomains: 0,
					referringPages: 0,
					brokenBacklinks: 0,
					spamScore: null,
					rank: null,
				},
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
