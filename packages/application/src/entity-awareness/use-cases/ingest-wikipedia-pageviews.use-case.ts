import { EntityAwareness, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface WikipediaPageviewRowInput {
	observedAt: Date;
	views: number;
	access: string;
	agent: string;
	granularity: string;
}

export interface IngestWikipediaPageviewsCommand {
	articleId: string;
	rows: readonly WikipediaPageviewRowInput[];
}

export interface IngestWikipediaPageviewsResult {
	ingested: number;
}

/**
 * Persists a batch of pageview rows for a previously-linked Wikipedia
 * article. No-op if the article was unlinked between scheduling and
 * fetch (the operator decided to stop tracking). One summary event
 * per batch, mirroring GscPerformanceBatchIngested.
 */
export class IngestWikipediaPageviewsUseCase {
	constructor(
		private readonly articles: EntityAwareness.WikipediaArticleRepository,
		private readonly observations: EntityAwareness.WikipediaPageviewObservationRepository,
		private readonly events: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: IngestWikipediaPageviewsCommand): Promise<IngestWikipediaPageviewsResult> {
		if (cmd.rows.length === 0) {
			return { ingested: 0 };
		}
		const article = await this.articles.findById(cmd.articleId as EntityAwareness.WikipediaArticleId);
		if (!article) {
			throw new NotFoundError(`Wikipedia article ${cmd.articleId} not found`);
		}
		if (!article.isActive()) {
			return { ingested: 0 };
		}

		let totalViews = 0;
		const observations = cmd.rows.map((row) => {
			totalViews += row.views;
			return EntityAwareness.WikipediaPageviewObservation.record({
				articleId: article.id,
				projectId: article.projectId,
				observedAt: row.observedAt,
				views: row.views,
				access: row.access,
				agent: row.agent,
				granularity: row.granularity,
			});
		});

		const { inserted } = await this.observations.saveAll(observations);

		await this.events.publish([
			new EntityAwareness.WikipediaPageviewsBatchIngested({
				articleId: article.id,
				projectId: article.projectId,
				rowsCount: inserted,
				totalViews,
				occurredAt: this.clock.now(),
			}),
		]);

		return { ingested: inserted };
	}
}
