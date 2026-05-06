import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

export class InMemoryBrandPromptRepository implements AiSearchInsights.BrandPromptRepository {
	private byId = new Map<string, AiSearchInsights.BrandPrompt>();

	async save(p: AiSearchInsights.BrandPrompt): Promise<void> {
		this.byId.set(p.id, p);
	}

	async findById(id: AiSearchInsights.BrandPromptId): Promise<AiSearchInsights.BrandPrompt | null> {
		return this.byId.get(id) ?? null;
	}

	async delete(id: AiSearchInsights.BrandPromptId): Promise<void> {
		this.byId.delete(id);
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly AiSearchInsights.BrandPrompt[]> {
		return [...this.byId.values()].filter((p) => p.projectId === projectId);
	}

	async findExisting(
		projectId: ProjectManagement.ProjectId,
		text: string,
	): Promise<AiSearchInsights.BrandPrompt | null> {
		return [...this.byId.values()].find((p) => p.projectId === projectId && p.text.value === text) ?? null;
	}
}
