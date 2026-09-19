import type { DomainAuthorityObservation } from '../entities/domain-authority-observation.js';
import type { ProjectId } from '../value-objects/identifiers.js';

export interface DomainAuthorityObservationRepository {
	/** Upsert on `(project_id, domain, observed_at)`: one row per project domain per UTC day. */
	save(observation: DomainAuthorityObservation): Promise<void>;
	/** Most recent first. */
	listForProject(projectId: ProjectId, limit: number): Promise<readonly DomainAuthorityObservation[]>;
}
