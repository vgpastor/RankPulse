import type { BingWebmasterInsights, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkBingPropertyUseCase } from './link-bing-property.use-case.js';
import { UnlinkBingPropertyUseCase } from './unlink-bing-property.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryBingPropertyRepo implements BingWebmasterInsights.BingPropertyRepository {
	readonly store = new Map<string, BingWebmasterInsights.BingProperty>();
	readonly bySite = new Map<string, BingWebmasterInsights.BingProperty>();
	async save(p: BingWebmasterInsights.BingProperty): Promise<void> {
		this.store.set(p.id, p);
		this.bySite.set(`${p.projectId}|${p.siteUrl}`, p);
	}
	async findById(
		id: BingWebmasterInsights.BingPropertyId,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSite(
		projectId: ProjectManagement.ProjectId,
		siteUrl: string,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		return this.bySite.get(`${projectId}|${siteUrl}`) ?? null;
	}
	async listForProject(): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		return [...this.store.values()];
	}
}

describe('UnlinkBingPropertyUseCase', () => {
	let repo: InMemoryBingPropertyRepo;
	let events: RecordingEventPublisher;
	let propertyId: string;

	beforeEach(async () => {
		repo = new InMemoryBingPropertyRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkBingPropertyUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['bp-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
		});
		propertyId = result.bingPropertyId;
		events.clear();
	});

	it('marks the property as unlinked and persists it', async () => {
		const useCase = new UnlinkBingPropertyUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));

		await useCase.execute({ bingPropertyId: propertyId });

		const stored = await repo.findById(propertyId as BingWebmasterInsights.BingPropertyId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.unlinkedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
	});

	it('is idempotent — a second unlink call is a no-op', async () => {
		const first = new UnlinkBingPropertyUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await first.execute({ bingPropertyId: propertyId });
		const firstUnlinkedAt = (await repo.findById(propertyId as BingWebmasterInsights.BingPropertyId))
			?.unlinkedAt;

		const second = new UnlinkBingPropertyUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'));
		await expect(second.execute({ bingPropertyId: propertyId })).resolves.toBeUndefined();

		const stored = await repo.findById(propertyId as BingWebmasterInsights.BingPropertyId);
		expect(stored?.unlinkedAt).toEqual(firstUnlinkedAt);
	});

	it('throws NotFoundError when the property does not exist', async () => {
		const useCase = new UnlinkBingPropertyUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await expect(useCase.execute({ bingPropertyId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
