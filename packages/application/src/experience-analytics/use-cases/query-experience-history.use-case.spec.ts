import { ExperienceAnalytics, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryExperienceHistoryUseCase } from './query-experience-history.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const CLARITY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as ExperienceAnalytics.ClarityProjectId;
const OTHER_CLARITY_ID =
	'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as ExperienceAnalytics.ClarityProjectId;

class InMemoryClarityRepo implements ExperienceAnalytics.ClarityProjectRepository {
	readonly store = new Map<string, ExperienceAnalytics.ClarityProject>();
	async save(p: ExperienceAnalytics.ClarityProject): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(
		id: ExperienceAnalytics.ClarityProjectId,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(): Promise<ExperienceAnalytics.ClarityProject | null> {
		return null;
	}
	async listForProject(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [];
	}
}

class InMemorySnapshotRepo implements ExperienceAnalytics.ExperienceSnapshotRepository {
	readonly rows: ExperienceAnalytics.ExperienceSnapshot[] = [];
	async save(s: ExperienceAnalytics.ExperienceSnapshot): Promise<{ inserted: boolean }> {
		this.rows.push(s);
		return { inserted: true };
	}
	async listForClarityProject(
		clarityProjectId: ExperienceAnalytics.ClarityProjectId,
		query: { from: string; to: string },
	): Promise<readonly ExperienceAnalytics.ExperienceSnapshot[]> {
		return this.rows
			.filter((r) => r.clarityProjectId === clarityProjectId)
			.filter((r) => r.observedDate >= query.from && r.observedDate <= query.to)
			.sort((a, b) => a.observedDate.localeCompare(b.observedDate));
	}
}

const buildSnapshot = (overrides: {
	observedDate: string;
	sessionsCount?: number;
	clarityProjectId?: ExperienceAnalytics.ClarityProjectId;
}): ExperienceAnalytics.ExperienceSnapshot =>
	ExperienceAnalytics.ExperienceSnapshot.record({
		clarityProjectId: overrides.clarityProjectId ?? CLARITY_ID,
		projectId: PROJECT_ID,
		observedDate: overrides.observedDate,
		metrics: ExperienceAnalytics.ExperienceMetrics.create({
			sessionsCount: overrides.sessionsCount ?? 100,
			botSessionsCount: 5,
			distinctUserCount: 80,
			pagesPerSession: 2.4,
			rageClicks: 3,
			deadClicks: 2,
			avgEngagementSeconds: 45.6,
			avgScrollDepth: 0.6,
		}),
		rawPayloadId: null,
	});

describe('QueryExperienceHistoryUseCase', () => {
	let projectsRepo: InMemoryClarityRepo;
	let snapshotsRepo: InMemorySnapshotRepo;
	let useCase: QueryExperienceHistoryUseCase;

	beforeEach(async () => {
		projectsRepo = new InMemoryClarityRepo();
		snapshotsRepo = new InMemorySnapshotRepo();
		useCase = new QueryExperienceHistoryUseCase(projectsRepo, snapshotsRepo);
		await projectsRepo.save(
			ExperienceAnalytics.ClarityProject.link({
				id: CLARITY_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				clarityHandle: 'abc123def4',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns snapshots in window for the clarity project', async () => {
		await snapshotsRepo.save(buildSnapshot({ observedDate: '2026-05-01', sessionsCount: 100 }));
		await snapshotsRepo.save(buildSnapshot({ observedDate: '2026-05-02', sessionsCount: 200 }));

		const result = await useCase.execute({
			clarityProjectId: CLARITY_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.sessionsCount)).toEqual([100, 200]);
	});

	it('throws NotFoundError when the clarity project does not exist', async () => {
		await expect(
			useCase.execute({ clarityProjectId: 'missing', from: '2026-05-01', to: '2026-05-02' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('honours the date window', async () => {
		await snapshotsRepo.save(buildSnapshot({ observedDate: '2026-04-30' }));
		await snapshotsRepo.save(buildSnapshot({ observedDate: '2026-05-15' }));

		const result = await useCase.execute({
			clarityProjectId: CLARITY_ID,
			from: '2026-05-01',
			to: '2026-05-31',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.observedDate).toBe('2026-05-15');
	});

	it('scopes results to the requested clarity project', async () => {
		await projectsRepo.save(
			ExperienceAnalytics.ClarityProject.link({
				id: OTHER_CLARITY_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				clarityHandle: 'xyz789aaa1',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await snapshotsRepo.save(buildSnapshot({ observedDate: '2026-05-01', sessionsCount: 100 }));
		await snapshotsRepo.save(
			buildSnapshot({
				observedDate: '2026-05-01',
				sessionsCount: 999,
				clarityProjectId: OTHER_CLARITY_ID,
			}),
		);

		const result = await useCase.execute({
			clarityProjectId: CLARITY_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.sessionsCount).toBe(100);
	});
});
