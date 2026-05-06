import type { MetaPixelEventDaily } from '../entities/meta-pixel-event-daily.js';
import type { MetaPixelId } from '../value-objects/identifiers.js';

export interface MetaPixelEventDailyQuery {
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface MetaPixelEventDailyRepository {
	/**
	 * Bulk-insert daily pixel-event rows. Implementations MUST be
	 * idempotent on the natural key (metaPixelId, observedDate, eventName)
	 * — a re-fetch of the same window should not duplicate rows.
	 */
	saveAll(rows: readonly MetaPixelEventDaily[]): Promise<{ inserted: number }>;
	listForPixel(
		pixelId: MetaPixelId,
		query: MetaPixelEventDailyQuery,
	): Promise<readonly MetaPixelEventDaily[]>;
}
