import type { IdentityAccess, ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkGscPropertyUseCase } from './link-gsc-property.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryGscPropertyRepo implements SearchConsoleInsights.GscPropertyRepository {
	readonly store = new Map<string, SearchConsoleInsights.GscProperty>();
	readonly bySite = new Map<string, SearchConsoleInsights.GscProperty>();
	async save(p: SearchConsoleInsights.GscProperty): Promise<void> {
		this.store.set(p.id, p);
		this.bySite.set(`${p.projectId}|${p.siteUrl}`, p);
	}
	async findById(id: SearchConsoleInsights.GscPropertyId): Promise<SearchConsoleInsights.GscProperty | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSite(
		projectId: ProjectManagement.ProjectId,
		siteUrl: string,
	): Promise<SearchConsoleInsights.GscProperty | null> {
		return this.bySite.get(`${projectId}|${siteUrl}`) ?? null;
	}
	async listForProject(): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		return [...this.store.values()];
	}
}

describe('LinkGscPropertyUseCase', () => {
	let repo: InMemoryGscPropertyRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new LinkGscPropertyUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(ids),
			events,
		);

	beforeEach(() => {
		repo = new InMemoryGscPropertyRepo();
		events = new RecordingEventPublisher();
	});

	it('persists a URL_PREFIX property and publishes GscPropertyLinked', async () => {
		const useCase = buildUseCase(['gsc-1' as Uuid]);

		const { gscPropertyId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
			propertyType: 'URL_PREFIX',
		});

		expect(gscPropertyId).toBe('gsc-1');
		const stored = repo.store.get(gscPropertyId);
		expect(stored?.siteUrl).toBe('https://example.com/');
		expect(stored?.propertyType).toBe('URL_PREFIX');
		expect(stored?.isActive()).toBe(true);
		expect(events.publishedTypes()).toContain('GscPropertyLinked');
	});

	it('persists a DOMAIN property when the siteUrl uses sc-domain: prefix', async () => {
		const useCase = buildUseCase(['gsc-1' as Uuid]);

		const { gscPropertyId } = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'sc-domain:example.com',
			propertyType: 'DOMAIN',
		});

		expect(repo.store.get(gscPropertyId)?.siteUrl).toBe('sc-domain:example.com');
		expect(repo.store.get(gscPropertyId)?.propertyType).toBe('DOMAIN');
	});

	it('rejects re-linking an already-active site to the same project', async () => {
		const useCase = buildUseCase(['gsc-1' as Uuid, 'gsc-2' as Uuid]);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
			propertyType: 'URL_PREFIX',
		});

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'https://example.com/',
				propertyType: 'URL_PREFIX',
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repo.store.size).toBe(1);
	});

	it('rejects a URL_PREFIX siteUrl missing the http(s) scheme before touching the repo', async () => {
		const useCase = buildUseCase(['gsc-1' as Uuid]);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'example.com',
				propertyType: 'URL_PREFIX',
			}),
		).rejects.toThrow();
		expect(repo.store.size).toBe(0);
		expect(events.published()).toHaveLength(0);
	});

	it('rejects a DOMAIN siteUrl that does not start with sc-domain:', async () => {
		const useCase = buildUseCase(['gsc-1' as Uuid]);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'example.com',
				propertyType: 'DOMAIN',
			}),
		).rejects.toThrow();
	});
});
