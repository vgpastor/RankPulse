import type { ExperienceAnalytics, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkClarityProjectUseCase } from './link-clarity-project.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryClarityProjectRepo implements ExperienceAnalytics.ClarityProjectRepository {
	readonly store = new Map<string, ExperienceAnalytics.ClarityProject>();
	readonly byHandle = new Map<string, ExperienceAnalytics.ClarityProject>();
	async save(p: ExperienceAnalytics.ClarityProject): Promise<void> {
		this.store.set(p.id, p);
		this.byHandle.set(`${p.projectId}|${p.clarityHandle.value}`, p);
	}
	async findById(
		id: ExperienceAnalytics.ClarityProjectId,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		clarityHandle: string,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.byHandle.get(`${projectId}|${clarityHandle}`) ?? null;
	}
	async listForProject(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [...this.store.values()];
	}
}

describe('LinkClarityProjectUseCase', () => {
	let repo: InMemoryClarityProjectRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new LinkClarityProjectUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(ids),
			events,
		);

	beforeEach(() => {
		repo = new InMemoryClarityProjectRepo();
		events = new RecordingEventPublisher();
	});

	it('persists the project (canonicalised handle) and publishes ClarityProjectLinked', async () => {
		const useCase = buildUseCase(['cp-1' as Uuid]);

		const { clarityProjectId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			clarityHandle: 'abcd1234ef',
		});

		expect(clarityProjectId).toBe('cp-1');
		expect(repo.store.get(clarityProjectId)?.clarityHandle.value).toBe('abcd1234ef');
		expect(repo.store.get(clarityProjectId)?.isActive()).toBe(true);
		expect(events.publishedTypes()).toContain('ClarityProjectLinked');
	});

	it('persists the credentialId when provided', async () => {
		const useCase = buildUseCase(['cp-1' as Uuid]);
		const { clarityProjectId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			clarityHandle: 'abcd1234ef',
			credentialId: 'cred-clarity-1',
		});
		expect(repo.store.get(clarityProjectId)?.credentialId).toBe('cred-clarity-1');
	});

	it('rejects re-linking an already-active handle to the same project', async () => {
		const useCase = buildUseCase(['cp-1' as Uuid, 'cp-2' as Uuid]);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			clarityHandle: 'abcd1234ef',
		});

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				clarityHandle: 'abcd1234ef',
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repo.store.size).toBe(1);
	});

	it('rejects a handle with characters outside the alphanumeric range', async () => {
		const useCase = buildUseCase(['cp-1' as Uuid]);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				clarityHandle: 'invalid handle!',
			}),
		).rejects.toThrow();
		expect(repo.store.size).toBe(0);
		expect(events.published()).toHaveLength(0);
	});

	it('rejects a handle that is too short (under 8 chars)', async () => {
		const useCase = buildUseCase(['cp-1' as Uuid]);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				clarityHandle: 'short',
			}),
		).rejects.toThrow();
	});
});
