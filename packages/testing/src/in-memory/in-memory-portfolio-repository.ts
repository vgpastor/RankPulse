import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';

export class InMemoryPortfolioRepository implements ProjectManagement.PortfolioRepository {
	private byId = new Map<string, ProjectManagement.Portfolio>();
	private projectCounts = new Map<string, number>();

	async save(p: ProjectManagement.Portfolio): Promise<void> {
		this.byId.set(p.id, p);
	}

	async findById(id: ProjectManagement.PortfolioId): Promise<ProjectManagement.Portfolio | null> {
		return this.byId.get(id) ?? null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly ProjectManagement.Portfolio[]> {
		return [...this.byId.values()].filter((p) => p.organizationId === orgId);
	}

	async delete(id: ProjectManagement.PortfolioId): Promise<void> {
		this.byId.delete(id);
		this.projectCounts.delete(id);
	}

	async countProjects(id: ProjectManagement.PortfolioId): Promise<number> {
		return this.projectCounts.get(id) ?? 0;
	}

	/** Test-only helper to seed project counts without going through Project entities. */
	setProjectCount(id: ProjectManagement.PortfolioId, count: number): void {
		this.projectCounts.set(id, count);
	}
}
