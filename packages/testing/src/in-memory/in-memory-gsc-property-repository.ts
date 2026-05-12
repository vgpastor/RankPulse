import type { IdentityAccess, ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';

/**
 * In-memory `GscPropertyRepository` for unit tests. Indexes by id for
 * `findById`, and a small linear scan for the project + site lookup.
 * Mirrors the production semantics (no soft-delete filter — the entity's
 * `unlinkedAt` field is the operator's source of truth, not a missing
 * row).
 */
export class InMemoryGscPropertyRepository implements SearchConsoleInsights.GscPropertyRepository {
	private readonly byId = new Map<string, SearchConsoleInsights.GscProperty>();

	async save(property: SearchConsoleInsights.GscProperty): Promise<void> {
		this.byId.set(property.id, property);
	}

	async findById(id: SearchConsoleInsights.GscPropertyId): Promise<SearchConsoleInsights.GscProperty | null> {
		return this.byId.get(id) ?? null;
	}

	async findByProjectAndSite(
		projectId: ProjectManagement.ProjectId,
		siteUrl: string,
	): Promise<SearchConsoleInsights.GscProperty | null> {
		for (const p of this.byId.values()) {
			if (p.projectId === projectId && p.siteUrl === siteUrl) return p;
		}
		return null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		return [...this.byId.values()].filter((p) => p.projectId === projectId);
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		return [...this.byId.values()].filter((p) => p.organizationId === orgId);
	}
}
