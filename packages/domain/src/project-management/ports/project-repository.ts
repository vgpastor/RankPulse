import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { Project } from '../entities/project.js';
import type { DomainName } from '../value-objects/domain-name.js';
import type { ProjectId } from '../value-objects/identifiers.js';

export interface ProjectRepository {
	save(project: Project): Promise<void>;
	findById(id: ProjectId): Promise<Project | null>;
	findByPrimaryDomain(orgId: OrganizationId, domain: DomainName): Promise<Project | null>;
	listForOrganization(orgId: OrganizationId): Promise<readonly Project[]>;
}
