import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkMetaPixelUseCase } from './link-meta-pixel.use-case.js';

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

describe('LinkMetaPixelUseCase', () => {
	let repo: InMemoryMetaPixelRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new LinkMetaPixelUseCase(repo, new FakeClock('2026-05-04T10:00:00Z'), new FixedIdGenerator(ids), events);

	beforeEach(() => {
		repo = new InMemoryMetaPixelRepo();
		events = new RecordingEventPublisher();
	});

	it('persists the pixel and publishes MetaPixelLinked', async () => {
		const useCase = buildUseCase(['p-1' as Uuid]);
		const { metaPixelId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			pixelHandle: '123456789012',
		});
		expect(repo.store.get(metaPixelId)?.handle.value).toBe('123456789012');
		expect(events.publishedTypes()).toContain('MetaPixelLinked');
	});

	it('rejects re-linking an already-active pixel to the same project', async () => {
		const useCase = buildUseCase(['p-1' as Uuid, 'p-2' as Uuid]);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			pixelHandle: '123456789012',
		});
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				pixelHandle: '123456789012',
			}),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('rejects a non-numeric pixel handle', async () => {
		const useCase = buildUseCase(['p-1' as Uuid]);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				pixelHandle: 'pixel-abc',
			}),
		).rejects.toThrow();
	});
});
