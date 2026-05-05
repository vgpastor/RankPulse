import type { EntityAwareness } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface WikipediaPageviewView {
	observedAt: string;
	views: number;
	access: string;
	agent: string;
	granularity: string;
}

export interface QueryWikipediaPageviewsQuery {
	articleId: string;
	from: Date;
	to: Date;
}

/**
 * Read-model query: pageviews of a linked article over a date range.
 * Returns DTOs (ISO strings) so the controller can pass them straight
 * to the response without leaking domain types.
 */
export class QueryWikipediaPageviewsUseCase {
	constructor(
		private readonly articles: EntityAwareness.WikipediaArticleRepository,
		private readonly observations: EntityAwareness.WikipediaPageviewObservationRepository,
	) {}

	async execute(q: QueryWikipediaPageviewsQuery): Promise<readonly WikipediaPageviewView[]> {
		const article = await this.articles.findById(q.articleId as EntityAwareness.WikipediaArticleId);
		if (!article) throw new NotFoundError(`Wikipedia article ${q.articleId} not found`);
		const observations = await this.observations.listForArticle(article.id, { from: q.from, to: q.to });
		return observations.map((o) => ({
			observedAt: o.observedAt.toISOString(),
			views: o.views,
			access: o.access,
			agent: o.agent,
			granularity: o.granularity,
		}));
	}
}
