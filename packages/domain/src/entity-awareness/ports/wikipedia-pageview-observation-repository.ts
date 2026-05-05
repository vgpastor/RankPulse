import type { WikipediaPageviewObservation } from '../entities/wikipedia-pageview-observation.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';

export interface WikipediaPageviewQuery {
	from: Date;
	to: Date;
}

export interface WikipediaPageviewObservationRepository {
	/**
	 * Bulk-insert observations. Implementations MUST be idempotent on
	 * (articleId, observedAt) — re-running the same fetch should not
	 * duplicate rows. Returns the count actually inserted (excludes
	 * conflicts dropped by `onConflictDoNothing`) so callers can
	 * publish accurate batch metrics.
	 */
	saveAll(observations: readonly WikipediaPageviewObservation[]): Promise<{ inserted: number }>;
	listForArticle(
		articleId: WikipediaArticleId,
		query: WikipediaPageviewQuery,
	): Promise<readonly WikipediaPageviewObservation[]>;
}
