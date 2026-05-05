import { EntityAwareness, type ProjectManagement } from '@rankpulse/domain';
import { and, between, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { wikipediaPageviews } from '../../schema/index.js';

export class DrizzleWikipediaPageviewObservationRepository
	implements EntityAwareness.WikipediaPageviewObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(
		observations: readonly EntityAwareness.WikipediaPageviewObservation[],
	): Promise<{ inserted: number }> {
		if (observations.length === 0) return { inserted: 0 };
		const inserted = await this.db
			.insert(wikipediaPageviews)
			.values(
				observations.map((o) => ({
					articleId: o.articleId,
					projectId: o.projectId,
					observedAt: o.observedAt,
					views: o.views,
					access: o.access,
					agent: o.agent,
					granularity: o.granularity,
				})),
			)
			.onConflictDoNothing({
				target: [wikipediaPageviews.articleId, wikipediaPageviews.observedAt],
			})
			.returning({ articleId: wikipediaPageviews.articleId });
		return { inserted: inserted.length };
	}

	async listForArticle(
		articleId: EntityAwareness.WikipediaArticleId,
		query: EntityAwareness.WikipediaPageviewQuery,
	): Promise<readonly EntityAwareness.WikipediaPageviewObservation[]> {
		const rows = await this.db
			.select()
			.from(wikipediaPageviews)
			.where(
				and(
					eq(wikipediaPageviews.articleId, articleId),
					between(wikipediaPageviews.observedAt, query.from, query.to),
				),
			)
			.orderBy(wikipediaPageviews.observedAt);
		return rows.map((r) =>
			EntityAwareness.WikipediaPageviewObservation.rehydrate({
				articleId: r.articleId as EntityAwareness.WikipediaArticleId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedAt: r.observedAt,
				views: r.views,
				access: r.access,
				agent: r.agent,
				granularity: r.granularity,
			}),
		);
	}
}
