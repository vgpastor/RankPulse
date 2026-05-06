import type { MetaAdsInsightDaily } from '../entities/meta-ads-insight-daily.js';
import type { MetaAdAccountId } from '../value-objects/identifiers.js';

export interface MetaAdsInsightDailyQuery {
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface MetaAdsInsightDailyRepository {
	/**
	 * Bulk-insert daily insight rows. Implementations MUST be idempotent
	 * on the natural key (metaAdAccountId, observedDate, level, entityId).
	 */
	saveAll(rows: readonly MetaAdsInsightDaily[]): Promise<{ inserted: number }>;
	listForAccount(
		accountId: MetaAdAccountId,
		query: MetaAdsInsightDailyQuery,
	): Promise<readonly MetaAdsInsightDaily[]>;
}
