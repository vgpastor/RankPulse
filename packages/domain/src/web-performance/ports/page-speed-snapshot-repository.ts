import type { PageSpeedSnapshot } from '../entities/page-speed-snapshot.js';
import type { TrackedPageId } from '../value-objects/identifiers.js';

export interface PageSpeedSnapshotQuery {
	from: Date;
	to: Date;
}

export interface PageSpeedSnapshotRepository {
	/**
	 * Idempotent on (trackedPageId, observedAt). Returns whether the
	 * row was newly inserted (true) or collided with an existing one
	 * (false), so the use case can decide whether to publish the
	 * domain event.
	 */
	save(snapshot: PageSpeedSnapshot): Promise<{ inserted: boolean }>;
	listForPage(
		trackedPageId: TrackedPageId,
		query: PageSpeedSnapshotQuery,
	): Promise<readonly PageSpeedSnapshot[]>;
}
