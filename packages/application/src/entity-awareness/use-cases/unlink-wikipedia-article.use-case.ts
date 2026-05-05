import type { EntityAwareness, SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export class UnlinkWikipediaArticleUseCase {
	constructor(
		private readonly articles: EntityAwareness.WikipediaArticleRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(articleId: string): Promise<void> {
		const article = await this.articles.findById(articleId as EntityAwareness.WikipediaArticleId);
		if (!article) throw new NotFoundError(`Wikipedia article ${articleId} not found`);
		article.unlink(this.clock.now());
		await this.articles.save(article);
		await this.events.publish(article.pullEvents());
	}
}
