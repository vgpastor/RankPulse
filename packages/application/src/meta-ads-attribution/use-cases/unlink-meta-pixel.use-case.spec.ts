import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkMetaPixelUseCase } from './link-meta-pixel.use-case.js';
import { UnlinkMetaPixelUseCase } from './unlink-meta-pixel.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryMetaPixelRepo implements MetaAdsAttribution.MetaPixelRepository {
	readonly store = new Map<string, MetaAdsAttribution.MetaPixel>();
	readonly byHandle = new Map<string, MetaAdsAttribution.MetaPixel>();
	async save(p: MetaAdsAttribution.MetaPixel): Promise<void> {
		this.store.set(p.id, p);
		this.byHandle.set(`${p.projectId}|${p.handle.value}`, p);
	}
	async findById(id: MetaAdsAttribution.MetaPixelId): Promise<MetaAdsAttribution.MetaPixel | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		pixelHandle: string,
	): Promise<MetaAdsAttribution.MetaPixel | null> {
		return this.byHandle.get(`${projectId}|${pixelHandle}`) ?? null;
	}
	async listForProject(): Promise<readonly MetaAdsAttribution.MetaPixel[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly MetaAdsAttribution.MetaPixel[]> {
		return [...this.store.values()];
	}
}

describe('UnlinkMetaPixelUseCase', () => {
	let repo: InMemoryMetaPixelRepo;
	let events: RecordingEventPublisher;
	let metaPixelId: string;

	beforeEach(async () => {
		repo = new InMemoryMetaPixelRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkMetaPixelUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['mp-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			pixelHandle: '123456789012',
		});
		metaPixelId = result.metaPixelId;
		events.clear();
	});

	it('marks the pixel as unlinked and persists it', async () => {
		const useCase = new UnlinkMetaPixelUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));

		await useCase.execute({ metaPixelId });

		const stored = await repo.findById(metaPixelId as MetaAdsAttribution.MetaPixelId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.unlinkedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
	});

	it('is idempotent — second unlink is a no-op', async () => {
		const first = new UnlinkMetaPixelUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await first.execute({ metaPixelId });
		const firstUnlinkedAt = (await repo.findById(metaPixelId as MetaAdsAttribution.MetaPixelId))?.unlinkedAt;

		const second = new UnlinkMetaPixelUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'));
		await expect(second.execute({ metaPixelId })).resolves.toBeUndefined();

		const stored = await repo.findById(metaPixelId as MetaAdsAttribution.MetaPixelId);
		expect(stored?.unlinkedAt).toEqual(firstUnlinkedAt);
	});

	it('throws NotFoundError when the pixel does not exist', async () => {
		const useCase = new UnlinkMetaPixelUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await expect(useCase.execute({ metaPixelId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
