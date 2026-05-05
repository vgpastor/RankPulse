import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { BingProperty } from '../entities/bing-property.js';
import type { BingPropertyId } from '../value-objects/identifiers.js';

export interface BingPropertyRepository {
	save(property: BingProperty): Promise<void>;
	findById(id: BingPropertyId): Promise<BingProperty | null>;
	findByProjectAndSite(projectId: ProjectId, siteUrl: string): Promise<BingProperty | null>;
	listForProject(projectId: ProjectId): Promise<readonly BingProperty[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly BingProperty[]>;
}
