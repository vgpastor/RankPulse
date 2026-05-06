import type { ExperienceAnalytics, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkClarityProjectUseCase } from './link-clarity-project.use-case.js';
import { RecordExperienceSnapshotUseCase } from './record-experience-snapshot.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryProjectRepo implements ExperienceAnalytics.ClarityProjectRepository {
	readonly store = new Map<string, ExperienceAnalytics.ClarityProject>();
	readonly byTuple = new Map<string, ExperienceAnalytics.ClarityProject>();
	async save(cp: ExperienceAnalytics.ClarityProject): Promise<void> {
		this.store.set(cp.id, cp);
		this.byTuple.set(`${cp.projectId}|${cp.clarityHandle.value}`, cp);
	}
	async findById(
		id: ExperienceAnalytics.ClarityProjectId,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		handle: string,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.byTuple.get(`${projectId}|${handle}`) ?? null;
	}
	async listForProject(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [];
	}
}

class InMemorySnapshotRepo implements ExperienceAnalytics.ExperienceSnapshotRepository {
	readonly store = new Map<string, ExperienceAnalytics.ExperienceSnapshot>();
	async save(snap: ExperienceAnalytics.ExperienceSnapshot): Promise<{ inserted: boolean }> {
		const k = `${snap.clarityProjectId}|${snap.observedDate}`;
		if (this.store.has(k)) return { inserted: false };
		this.store.set(k, snap);
		return { inserted: true };
	}
	async listForClarityProject(): Promise<readonly ExperienceAnalytics.ExperienceSnapshot[]> {
		return [...this.store.values()];
	}
}

describe('RecordExperienceSnapshotUseCase', () => {
	let projectRepo: InMemoryProjectRepo;
	let snapshotRepo: InMemorySnapshotRepo;
	let events: RecordingEventPublisher;
	let clarityProjectId: string;

	beforeEach(async () => {
		projectRepo = new InMemoryProjectRepo();
		snapshotRepo = new InMemorySnapshotRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkClarityProjectUseCase(
			projectRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['cp-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			clarityHandle: 'claritySlug42',
		});
		clarityProjectId = result.clarityProjectId;
		events.clear();
	});

	const baseCommand = (overrides: Partial<{ avgScrollDepth: number; sessionsCount: number }> = {}) => ({
		clarityProjectId,
		observedDate: '2026-05-01',
		sessionsCount: overrides.sessionsCount ?? 12_500,
		botSessionsCount: 1_200,
		distinctUserCount: 8_400,
		pagesPerSession: 3.4,
		rageClicks: 47,
		deadClicks: 19,
		avgEngagementSeconds: 142.7,
		avgScrollDepth: overrides.avgScrollDepth ?? 0.62,
		rawPayloadId: null,
	});

	const buildUseCase = () =>
		new RecordExperienceSnapshotUseCase(
			projectRepo,
			snapshotRepo,
			events,
			new FakeClock('2026-05-04T11:00:00Z'),
		);

	it('persists the snapshot and publishes ExperienceSnapshotRecorded on first insert', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute(baseCommand());
		expect(result.inserted).toBe(true);
		expect(snapshotRepo.store.size).toBe(1);
		expect(events.publishedTypes()).toContain('ExperienceSnapshotRecorded');
	});

	it('does NOT publish event on idempotent re-fetch (same observedDate)', async () => {
		const useCase = buildUseCase();
		await useCase.execute(baseCommand());
		events.clear();
		const second = await useCase.execute(baseCommand());
		expect(second.inserted).toBe(false);
		expect(events.published()).toEqual([]);
	});

	it('throws NotFoundError when the clarity project does not exist', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ ...baseCommand(), clarityProjectId: 'missing' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it('rejects scroll depth outside [0, 1] at the aggregate boundary', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ ...baseCommand(), avgScrollDepth: 1.5 })).rejects.toThrow();
		await expect(useCase.execute({ ...baseCommand(), avgScrollDepth: -0.1 })).rejects.toThrow();
		expect(snapshotRepo.store.size).toBe(0);
	});

	it('rejects negative session counts at the aggregate boundary', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ ...baseCommand(), sessionsCount: -1 })).rejects.toThrow();
	});
});
