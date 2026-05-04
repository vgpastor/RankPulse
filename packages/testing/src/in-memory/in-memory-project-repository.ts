import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';

export class InMemoryProjectRepository implements ProjectManagement.ProjectRepository {
	private byId = new Map<string, ProjectManagement.Project>();

	async save(project: ProjectManagement.Project): Promise<void> {
		this.byId.set(project.id, project);
	}

	async findById(id: ProjectManagement.ProjectId): Promise<ProjectManagement.Project | null> {
		return this.byId.get(id) ?? null;
	}

	async findByPrimaryDomain(
		orgId: IdentityAccess.OrganizationId,
		domain: ProjectManagement.DomainName,
	): Promise<ProjectManagement.Project | null> {
		for (const p of this.byId.values()) {
			if (p.organizationId === orgId && p.primaryDomain.equals(domain)) {
				return p;
			}
		}
		return null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly ProjectManagement.Project[]> {
		return [...this.byId.values()].filter((p) => p.organizationId === orgId);
	}

	size(): number {
		return this.byId.size;
	}
}
