import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ApiUsageEntry } from '../entities/api-usage-entry.js';

/** How a usage report groups its rows. */
export type UsageGrouping = 'provider' | 'endpoint' | 'project';

/**
 * One row of a usage report: what was spent, against how many billed calls,
 * for whichever dimension the caller grouped by.
 */
export interface UsageBreakdownRow {
	/** The grouped value: a provider id, an endpoint id, or a project id. */
	key: string;
	/** Provider the row belongs to. Equals `key` when grouping by provider. */
	providerId: string;
	calls: number;
	costCents: number;
}

export interface ApiUsageRepository {
	save(entry: ApiUsageEntry): Promise<void>;
	/** Sum cost cents for an organization in [from, to). */
	sumCostCents(orgId: OrganizationId, from: Date, to: Date): Promise<number>;
	/**
	 * Billed calls and their cost in [from, to), grouped by one dimension.
	 * Only real upstream calls appear here — a run served from cache never
	 * produces an entry, which is what makes the cache-hit ratio meaningful.
	 */
	breakdown(
		orgId: OrganizationId,
		from: Date,
		to: Date,
		groupBy: UsageGrouping,
	): Promise<readonly UsageBreakdownRow[]>;
}
