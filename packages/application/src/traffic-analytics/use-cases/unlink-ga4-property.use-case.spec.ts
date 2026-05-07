import type { IdentityAccess, ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkGa4PropertyUseCase } from './link-ga4-property.use-case.js';
import { UnlinkGa4PropertyUseCase } from './unlink-ga4-property.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryGa4PropertyRepo implements TrafficAnalytics.Ga4PropertyRepository {
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

describe('UnlinkGa4PropertyUseCase', () => {
	let repo: InMemoryGa4PropertyRepo;
	let events: RecordingEventPublisher;
	let propertyId: string;

	beforeEach(async () => {
		repo = new InMemoryGa4PropertyRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkGa4PropertyUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['ga4-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			propertyHandle: '123456789',
		});
		propertyId = result.ga4PropertyId;
		events.clear();
	});

	it('marks the property as unlinked and persists it', async () => {
		const useCase = new UnlinkGa4PropertyUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));

		await useCase.execute({ ga4PropertyId: propertyId });

		const stored = await repo.findById(propertyId as TrafficAnalytics.Ga4PropertyId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.unlinkedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
	});

	it('is idempotent — second unlink is a no-op', async () => {
		const first = new UnlinkGa4PropertyUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await first.execute({ ga4PropertyId: propertyId });
		const firstUnlinkedAt = (await repo.findById(propertyId as TrafficAnalytics.Ga4PropertyId))?.unlinkedAt;

		const second = new UnlinkGa4PropertyUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'));
		await expect(second.execute({ ga4PropertyId: propertyId })).resolves.toBeUndefined();

		const stored = await repo.findById(propertyId as TrafficAnalytics.Ga4PropertyId);
		expect(stored?.unlinkedAt).toEqual(firstUnlinkedAt);
	});

	it('throws NotFoundError when the property does not exist', async () => {
		const useCase = new UnlinkGa4PropertyUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await expect(useCase.execute({ ga4PropertyId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
