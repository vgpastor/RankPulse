import type { ProjectManagement } from '@rankpulse/domain';

export class InMemoryKeywordListRepository implements ProjectManagement.KeywordListRepository {
	private byId = new Map<string, ProjectManagement.KeywordList>();

	async save(list: ProjectManagement.KeywordList): Promise<void> {
		this.byId.set(list.id, list);
	}

	async findById(id: ProjectManagement.KeywordListId): Promise<ProjectManagement.KeywordList | null> {
		return this.byId.get(id) ?? null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ProjectManagement.KeywordList[]> {
		return [...this.byId.values()].filter((l) => l.projectId === projectId);
	}
}
