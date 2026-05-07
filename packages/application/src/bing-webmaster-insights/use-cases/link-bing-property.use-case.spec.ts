import type { BingWebmasterInsights, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkBingPropertyUseCase } from './link-bing-property.use-case.js';

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

describe('LinkBingPropertyUseCase', () => {
	let repo: InMemoryBingPropertyRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new LinkBingPropertyUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(ids),
			events,
		);

	beforeEach(() => {
		repo = new InMemoryBingPropertyRepo();
		events = new RecordingEventPublisher();
	});

	it('persists the property and publishes BingPropertyLinked', async () => {
		const useCase = buildUseCase(['bp-1' as Uuid]);

		const { bingPropertyId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
		});

		expect(bingPropertyId).toBe('bp-1');
		expect(repo.store.get(bingPropertyId)?.siteUrl).toBe('https://example.com/');
		expect(repo.store.get(bingPropertyId)?.isActive()).toBe(true);
		expect(events.publishedTypes()).toContain('BingPropertyLinked');
	});

	it('persists the credentialId when provided', async () => {
		const useCase = buildUseCase(['bp-1' as Uuid]);
		const { bingPropertyId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
			credentialId: 'cred-bing-1',
		});
		expect(repo.store.get(bingPropertyId)?.credentialId).toBe('cred-bing-1');
	});

	it('rejects re-linking an already-active site to the same project', async () => {
		const useCase = buildUseCase(['bp-1' as Uuid, 'bp-2' as Uuid]);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
		});

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'https://example.com/',
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repo.store.size).toBe(1);
	});

	it('rejects a siteUrl missing the http(s) scheme before touching the repo', async () => {
		const useCase = buildUseCase(['bp-1' as Uuid]);

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'example.com',
			}),
		).rejects.toThrow();
		expect(repo.store.size).toBe(0);
		expect(events.published()).toHaveLength(0);
	});

	it('rejects an empty siteUrl', async () => {
		const useCase = buildUseCase(['bp-1' as Uuid]);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: '   ',
			}),
		).rejects.toThrow();
	});
});
