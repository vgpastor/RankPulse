import type { EntityAwareness, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import { LinkWikipediaArticleUseCase } from './link-wikipedia-article.use-case.js';

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

const buildClock = () => new FakeClock('2026-05-04T10:00:00Z');
const buildIds = (...uuids: string[]) => new FixedIdGenerator(uuids as Uuid[]);

describe('LinkWikipediaArticleUseCase', () => {
	it('persists a fresh article and publishes WikipediaArticleLinked', async () => {
		const repo = new InMemoryArticleRepo();
		const events = new RecordingEventPublisher();
		const useCase = new LinkWikipediaArticleUseCase(repo, buildClock(), buildIds('art-1' as never), events);

		const result = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			wikipediaProject: 'es.wikipedia.org',
			slug: 'Torre_Eiffel',
		});

		expect(result.articleId).toBe('art-1');
		expect(repo.store.size).toBe(1);
		const stored = [...repo.store.values()][0];
		expect(stored?.label).toBe('Torre_Eiffel'); // defaults to slug when label omitted
		expect(stored?.isActive()).toBe(true);
		expect(events.publishedTypes()).toContain('WikipediaArticleLinked');
	});

	it('throws ConflictError when an active link already exists for the same (project, wp-project, slug)', async () => {
		const repo = new InMemoryArticleRepo();
		const events = new RecordingEventPublisher();
		const useCase = new LinkWikipediaArticleUseCase(
			repo,
			buildClock(),
			buildIds('art-1' as never, 'art-2' as never),
			events,
		);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			wikipediaProject: 'es.wikipedia.org',
			slug: 'Torre_Eiffel',
		});
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				wikipediaProject: 'es.wikipedia.org',
				slug: 'Torre_Eiffel',
			}),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('allows re-linking after the previous link was unlinked (creates a NEW aggregate)', async () => {
		const repo = new InMemoryArticleRepo();
		const events = new RecordingEventPublisher();
		const useCase = new LinkWikipediaArticleUseCase(
			repo,
			buildClock(),
			buildIds('art-1' as never, 'art-2' as never),
			events,
		);
		const first = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			wikipediaProject: 'es.wikipedia.org',
			slug: 'Torre_Eiffel',
		});
		const article = repo.store.get(first.articleId);
		article?.unlink(new Date('2026-05-05T10:00:00Z'));
		await repo.save(article as EntityAwareness.WikipediaArticle);

		const second = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			wikipediaProject: 'es.wikipedia.org',
			slug: 'Torre_Eiffel',
		});
		expect(second.articleId).toBe('art-2');
		expect(second.articleId).not.toBe(first.articleId);
	});

	it('rejects malformed wikipediaProject before touching the repo', async () => {
		const repo = new InMemoryArticleRepo();
		const events = new RecordingEventPublisher();
		const useCase = new LinkWikipediaArticleUseCase(repo, buildClock(), buildIds('art-1' as never), events);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				wikipediaProject: 'wikipedia.org',
				slug: 'Torre_Eiffel',
			}),
		).rejects.toThrow();
		expect(repo.store.size).toBe(0);
	});

	it('rejects slug containing whitespace (operator must canonicalise)', async () => {
		const repo = new InMemoryArticleRepo();
		const events = new RecordingEventPublisher();
		const useCase = new LinkWikipediaArticleUseCase(repo, buildClock(), buildIds('art-1' as never), events);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				wikipediaProject: 'es.wikipedia.org',
				slug: 'Torre Eiffel',
			}),
		).rejects.toThrow();
	});
});
