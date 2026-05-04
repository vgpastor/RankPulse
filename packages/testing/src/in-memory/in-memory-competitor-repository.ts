import type { ProjectManagement } from '@rankpulse/domain';

export class InMemoryCompetitorRepository implements ProjectManagement.CompetitorRepository {
	private byId = new Map<string, ProjectManagement.Competitor>();

	async save(c: ProjectManagement.Competitor): Promise<void> {
		this.byId.set(c.id, c);
	}

	async findById(id: ProjectManagement.CompetitorId): Promise<ProjectManagement.Competitor | null> {
		return this.byId.get(id) ?? null;
	}

	async findByDomain(
		projectId: ProjectManagement.ProjectId,
		domain: ProjectManagement.DomainName,
	): Promise<ProjectManagement.Competitor | null> {
		for (const c of this.byId.values()) {
			if (c.projectId === projectId && c.domain.equals(domain)) {
				return c;
			}
		}
		return null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ProjectManagement.Competitor[]> {
		return [...this.byId.values()].filter((c) => c.projectId === projectId);
	}
}
