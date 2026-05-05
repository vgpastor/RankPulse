import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { BingTrafficObservation } from '../entities/bing-traffic-observation.js';
import type { BingPropertyId } from '../value-objects/identifiers.js';

export interface BingTrafficObservationQuery {
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface BingTrafficObservationRepository {
	/**
	 * Bulk-insert observations. Implementations MUST be idempotent on the
	 * natural key (bingPropertyId, observedDate) — a re-fetch of the same
	 * 6-month window should not duplicate rows. Returns the count actually
	 * inserted (excludes conflict-skipped rows) so the batch summary event
	 * reports honest numbers.
	 */
	saveAll(observations: readonly BingTrafficObservation[]): Promise<{ inserted: number }>;
	listForProperty(
		propertyId: BingPropertyId,
		query: BingTrafficObservationQuery,
	): Promise<readonly BingTrafficObservation[]>;
	listLatestForProject(projectId: ProjectId): Promise<readonly BingTrafficObservation[]>;
}
