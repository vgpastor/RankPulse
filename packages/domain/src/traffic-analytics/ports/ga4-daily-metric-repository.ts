import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { Ga4DailyMetric } from '../entities/ga4-daily-metric.js';
import type { Ga4PropertyId } from '../value-objects/identifiers.js';

export interface Ga4DailyMetricQuery {
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface Ga4DailyMetricRepository {
	/**
	 * Bulk-insert daily metrics. Implementations MUST be idempotent on
	 * the natural key (ga4PropertyId, observedDate, dimensionsHash) — a
	 * re-fetch of the same window with the same dimensions should not
	 * duplicate rows. Returns the number actually inserted (excludes
	 * conflict-skipped rows) so the caller can publish accurate metrics.
	 */
	saveAll(metrics: readonly Ga4DailyMetric[]): Promise<{ inserted: number }>;
	listForProperty(propertyId: Ga4PropertyId, query: Ga4DailyMetricQuery): Promise<readonly Ga4DailyMetric[]>;
	listLatestForProject(projectId: ProjectId): Promise<readonly Ga4DailyMetric[]>;
}
