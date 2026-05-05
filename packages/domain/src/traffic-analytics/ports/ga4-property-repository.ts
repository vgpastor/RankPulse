import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { Ga4Property } from '../entities/ga4-property.js';
import type { Ga4PropertyId } from '../value-objects/identifiers.js';

export interface Ga4PropertyRepository {
	save(property: Ga4Property): Promise<void>;
	findById(id: Ga4PropertyId): Promise<Ga4Property | null>;
	findByProjectAndHandle(projectId: ProjectId, propertyHandle: string): Promise<Ga4Property | null>;
	listForProject(projectId: ProjectId): Promise<readonly Ga4Property[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly Ga4Property[]>;
}
