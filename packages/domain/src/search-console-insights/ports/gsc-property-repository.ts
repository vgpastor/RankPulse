import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { GscProperty } from '../entities/gsc-property.js';
import type { GscPropertyId } from '../value-objects/identifiers.js';

export interface GscPropertyRepository {
	save(property: GscProperty): Promise<void>;
	findById(id: GscPropertyId): Promise<GscProperty | null>;
	findByProjectAndSite(projectId: ProjectId, siteUrl: string): Promise<GscProperty | null>;
	listForProject(projectId: ProjectId): Promise<readonly GscProperty[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly GscProperty[]>;
}
