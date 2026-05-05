import type { IdentityAccess, ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkGa4PropertyUseCase } from './link-ga4-property.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryPropertyRepo implements TrafficAnalytics.Ga4PropertyRepository {
	readonly store = new Map<string, TrafficAnalytics.Ga4Property>();
	readonly byHandle = new Map<string, TrafficAnalytics.Ga4Property>();
	async save(p: TrafficAnalytics.Ga4Property): Promise<void> {
		this.store.set(p.id, p);
		this.byHandle.set(`${p.projectId}|${p.propertyHandle.value}`, p);
	}
	async findById(id: TrafficAnalytics.Ga4PropertyId): Promise<TrafficAnalytics.Ga4Property | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		propertyHandle: string,
	): Promise<TrafficAnalytics.Ga4Property | null> {
		return this.byHandle.get(`${projectId}|${propertyHandle}`) ?? null;
	}
	async listForProject(): Promise<readonly TrafficAnalytics.Ga4Property[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly TrafficAnalytics.Ga4Property[]> {
		return [...this.store.values()];
	}
}

describe('LinkGa4PropertyUseCase', () => {
	let repo: InMemoryPropertyRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new LinkGa4PropertyUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(ids),
			events,
		);

	beforeEach(() => {
		repo = new InMemoryPropertyRepo();
		events = new RecordingEventPublisher();
	});

	it('canonicalises a "properties/<id>" handle into bare numeric form before save', async () => {
		const useCase = buildUseCase(['p-1' as Uuid]);
		const result = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			propertyHandle: 'properties/123456789',
		});
		const stored = repo.store.get(result.ga4PropertyId);
		expect(stored?.propertyHandle.value).toBe('123456789');
	});

	it('publishes Ga4PropertyLinked on first link', async () => {
		const useCase = buildUseCase(['p-1' as Uuid]);
		await useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, propertyHandle: '123456789' });
		expect(events.publishedTypes()).toContain('Ga4PropertyLinked');
	});

	it('rejects re-linking an already-active property to the same project', async () => {
		const useCase = buildUseCase(['p-1' as Uuid, 'p-2' as Uuid]);
		await useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, propertyHandle: '123' });
		await expect(
			useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, propertyHandle: '123' }),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('rejects a non-numeric handle', async () => {
		const useCase = buildUseCase(['p-1' as Uuid]);
		await expect(
			useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, propertyHandle: 'GA-12345' }),
		).rejects.toThrow();
	});
});
