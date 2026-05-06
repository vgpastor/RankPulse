import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { ClarityProject } from '../entities/clarity-project.js';
import type { ClarityProjectId } from '../value-objects/identifiers.js';

export interface ClarityProjectRepository {
	save(clarityProject: ClarityProject): Promise<void>;
	findById(id: ClarityProjectId): Promise<ClarityProject | null>;
	findByProjectAndHandle(projectId: ProjectId, clarityHandle: string): Promise<ClarityProject | null>;
	listForProject(projectId: ProjectId): Promise<readonly ClarityProject[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly ClarityProject[]>;
}
