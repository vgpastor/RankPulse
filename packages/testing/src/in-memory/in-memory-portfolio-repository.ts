import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';

export class InMemoryPortfolioRepository implements ProjectManagement.PortfolioRepository {
	private byId = new Map<string, ProjectManagement.Portfolio>();

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
}
