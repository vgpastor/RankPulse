import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { GscPerformanceObservation } from '../entities/gsc-performance-observation.js';
import type { GscPropertyId } from '../value-objects/identifiers.js';

export interface GscObservationQuery {
	from: Date;
	to: Date;
	query?: string | null;
	page?: string | null;
	country?: string | null;
	device?: string | null;
}

export interface GscPerformanceObservationRepository {
	saveAll(observations: readonly GscPerformanceObservation[]): Promise<void>;
	listForProperty(
		propertyId: GscPropertyId,
		query: GscObservationQuery,
	): Promise<readonly GscPerformanceObservation[]>;
	listLatestForProject(projectId: ProjectId): Promise<readonly GscPerformanceObservation[]>;
}
