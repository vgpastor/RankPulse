import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { Project } from '../entities/project.js';
import type { DomainName } from '../value-objects/domain-name.js';
import type { ProjectId } from '../value-objects/identifiers.js';

export interface ProjectRepository {
	save(project: Project): Promise<void>;
	findById(id: ProjectId): Promise<Project | null>;
	findByPrimaryDomain(orgId: OrganizationId, domain: DomainName): Promise<Project | null>;
	listForOrganization(orgId: OrganizationId): Promise<readonly Project[]>;
	/**
	 * Returns the project that has `domain` attached (as primary or via
	 * `addDomain`) within the same organization, regardless of which project
	 * it is. Used by AddDomainToProjectUseCase to distinguish "already in
	 * THIS project" from "already in ANOTHER project of the same org" — the
	 * cross-project case ships a more useful error message (BACKLOG #24).
	 */
	findByDomainInOrganization(orgId: OrganizationId, domain: DomainName): Promise<Project | null>;
}
