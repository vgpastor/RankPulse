import { EntityAwareness, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryWikipediaPageviewsUseCase } from './query-wikipedia-pageviews.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const ARTICLE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as EntityAwareness.WikipediaArticleId;
const OTHER_ARTICLE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as EntityAwareness.WikipediaArticleId;

class InMemoryArticleRepo implements EntityAwareness.WikipediaArticleRepository {
	readonly store = new Map<string, EntityAwareness.WikipediaArticle>();
	async save(a: EntityAwareness.WikipediaArticle): Promise<void> {
		this.store.set(a.id, a);
	}
	async findById(id: EntityAwareness.WikipediaArticleId): Promise<EntityAwareness.WikipediaArticle | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSlug(): Promise<EntityAwareness.WikipediaArticle | null> {
		return null;
	}
	async listForProject(): Promise<readonly EntityAwareness.WikipediaArticle[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly EntityAwareness.WikipediaArticle[]> {
		return [];
	}
}

class InMemoryObsRepo implements EntityAwareness.WikipediaPageviewObservationRepository {
	readonly rows: EntityAwareness.WikipediaPageviewObservation[] = [];
	async saveAll(
		observations: readonly EntityAwareness.WikipediaPageviewObservation[],
	): Promise<{ inserted: number }> {
		this.rows.push(...observations);
		return { inserted: observations.length };
	}
	async listForArticle(
		articleId: EntityAwareness.WikipediaArticleId,
		query: { from: Date; to: Date },
	): Promise<readonly EntityAwareness.WikipediaPageviewObservation[]> {
		return this.rows
			.filter((r) => r.articleId === articleId)
			.filter((r) => r.observedAt >= query.from && r.observedAt <= query.to)
			.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
	}
}

const buildObservation = (overrides: {
	observedAt: Date;
	views?: number;
	articleId?: EntityAwareness.WikipediaArticleId;
}): EntityAwareness.WikipediaPageviewObservation =>
	EntityAwareness.WikipediaPageviewObservation.record({
		articleId: overrides.articleId ?? ARTICLE_ID,
		projectId: PROJECT_ID,
		observedAt: overrides.observedAt,
		views: overrides.views ?? 100,
		access: 'all-access',
		agent: 'user',
		granularity: 'daily',
	});

describe('QueryWikipediaPageviewsUseCase', () => {
	let articleRepo: InMemoryArticleRepo;
	let obsRepo: InMemoryObsRepo;
	let useCase: QueryWikipediaPageviewsUseCase;

	beforeEach(async () => {
		articleRepo = new InMemoryArticleRepo();
		obsRepo = new InMemoryObsRepo();
		useCase = new QueryWikipediaPageviewsUseCase(articleRepo, obsRepo);
		await articleRepo.save(
			EntityAwareness.WikipediaArticle.link({
				id: ARTICLE_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				wikipediaProject: EntityAwareness.WikipediaProject.create('en.wikipedia.org'),
				slug: EntityAwareness.ArticleSlug.create('OurBrand'),
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns observations in window for the article', async () => {
		await obsRepo.saveAll([
			buildObservation({ observedAt: new Date('2026-05-01T00:00:00Z'), views: 100 }),
			buildObservation({ observedAt: new Date('2026-05-02T00:00:00Z'), views: 150 }),
		]);

		const result = await useCase.execute({
			articleId: ARTICLE_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.views)).toEqual([100, 150]);
	});

	it('throws NotFoundError when the article does not exist', async () => {
		await expect(
			useCase.execute({
				articleId: 'missing',
				from: new Date('2026-04-01T00:00:00Z'),
				to: new Date('2026-05-31T00:00:00Z'),
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('honours the date window', async () => {
		await obsRepo.saveAll([
			buildObservation({ observedAt: new Date('2026-04-15T00:00:00Z') }),
			buildObservation({ observedAt: new Date('2026-05-15T00:00:00Z') }),
		]);

		const result = await useCase.execute({
			articleId: ARTICLE_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
	});

	it('scopes to the requested article', async () => {
		await articleRepo.save(
			EntityAwareness.WikipediaArticle.link({
				id: OTHER_ARTICLE_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				wikipediaProject: EntityAwareness.WikipediaProject.create('en.wikipedia.org'),
				slug: EntityAwareness.ArticleSlug.create('Competitor'),
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await obsRepo.saveAll([
			buildObservation({ observedAt: new Date('2026-05-01T00:00:00Z'), views: 100 }),
			buildObservation({
				observedAt: new Date('2026-05-01T00:00:00Z'),
				views: 999,
				articleId: OTHER_ARTICLE_ID,
			}),
		]);

		const result = await useCase.execute({
			articleId: ARTICLE_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.views).toBe(100);
	});
});
