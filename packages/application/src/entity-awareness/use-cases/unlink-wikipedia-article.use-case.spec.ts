import type { EntityAwareness, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkWikipediaArticleUseCase } from './link-wikipedia-article.use-case.js';
import { UnlinkWikipediaArticleUseCase } from './unlink-wikipedia-article.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryArticleRepo implements EntityAwareness.WikipediaArticleRepository {
	readonly store = new Map<string, EntityAwareness.WikipediaArticle>();
	async save(a: EntityAwareness.WikipediaArticle): Promise<void> {
		this.store.set(a.id, a);
	}
	async findById(id: EntityAwareness.WikipediaArticleId) {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSlug(
		projectId: ProjectManagement.ProjectId,
		wpProject: EntityAwareness.WikipediaProject,
		slug: EntityAwareness.ArticleSlug,
	) {
		for (const a of this.store.values()) {
			if (
				a.projectId === projectId &&
				a.wikipediaProject.value === wpProject.value &&
				a.slug.value === slug.value
			)
				return a;
		}
		return null;
	}
	async listForProject(projectId: ProjectManagement.ProjectId) {
		return [...this.store.values()].filter((a) => a.projectId === projectId);
	}
	async listForOrganization(orgId: IdentityAccess.OrganizationId) {
		return [...this.store.values()].filter((a) => a.organizationId === orgId);
	}
}

describe('UnlinkWikipediaArticleUseCase', () => {
	let repo: InMemoryArticleRepo;
	let events: RecordingEventPublisher;
	let articleId: string;

	beforeEach(async () => {
		repo = new InMemoryArticleRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkWikipediaArticleUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['art-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			wikipediaProject: 'es.wikipedia.org',
			slug: 'Torre_Eiffel',
		});
		articleId = result.articleId;
		events.clear();
	});

	it('marks the article as unlinked, persists it and publishes WikipediaArticleUnlinked', async () => {
		const useCase = new UnlinkWikipediaArticleUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'), events);

		await useCase.execute(articleId);

		const stored = await repo.findById(articleId as EntityAwareness.WikipediaArticleId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.unlinkedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
		expect(events.publishedTypes()).toContain('WikipediaArticleUnlinked');
	});

	it('throws NotFoundError when the article does not exist', async () => {
		const useCase = new UnlinkWikipediaArticleUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'), events);
		await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
		expect(events.published()).toHaveLength(0);
	});

	it('throws ConflictError on a second unlink (aggregate enforces single transition)', async () => {
		const first = new UnlinkWikipediaArticleUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'), events);
		await first.execute(articleId);
		events.clear();

		const second = new UnlinkWikipediaArticleUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'), events);
		await expect(second.execute(articleId)).rejects.toBeInstanceOf(ConflictError);
		expect(events.published()).toHaveLength(0);
	});
});
