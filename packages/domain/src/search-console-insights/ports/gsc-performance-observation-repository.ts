import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { GscPerformanceObservation } from '../entities/gsc-performance-observation.js';
import type { GscPropertyId } from '../value-objects/identifiers.js';

export interface GscObservationQuery {
	from: Date;
	to: Date;
	/**
	 * Dimension filter semantics (apply identically to query/page/country/device):
	 *   - `undefined` or `null` → no filter on this dimension.
	 *   - `''` (explicit empty string) → match rows where the dimension was
	 *     absent in the GSC API response (storage uses `''` instead of NULL
	 *     so the natural-key PK can cover every row without COALESCE).
	 *   - any other string → exact match on that value.
	 */
	query?: string | null;
	page?: string | null;
	country?: string | null;
	device?: string | null;
}

export interface GscPerformanceObservationRepository {
	/**
	 * Bulk-insert observations. Implementations MUST be idempotent on
	 * the natural key (observedAt, propertyId, query, page, country,
	 * device) — a re-fetch of the same day with the same dimensions
	 * should not produce duplicate rows. Returns the number of rows
	 * actually inserted (excludes rows that collided with the unique
	 * key and were silently dropped) so callers can publish accurate
	 * batch metrics.
	 */
	saveAll(observations: readonly GscPerformanceObservation[]): Promise<{ inserted: number }>;
	listForProperty(
		propertyId: GscPropertyId,
		query: GscObservationQuery,
	): Promise<readonly GscPerformanceObservation[]>;
	listLatestForProject(projectId: ProjectId): Promise<readonly GscPerformanceObservation[]>;
}
