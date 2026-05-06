import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

export class InMemoryLlmAnswerRepository implements AiSearchInsights.LlmAnswerRepository {
	private byId = new Map<string, AiSearchInsights.LlmAnswer>();

	async save(a: AiSearchInsights.LlmAnswer): Promise<void> {
		this.byId.set(a.id, a);
	}

	async findById(id: AiSearchInsights.LlmAnswerId): Promise<AiSearchInsights.LlmAnswer | null> {
		return this.byId.get(id) ?? null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
		filter?: AiSearchInsights.LlmAnswerListFilter,
	): Promise<readonly AiSearchInsights.LlmAnswer[]> {
		const all = [...this.byId.values()].filter((a) => a.projectId === projectId);
		const filtered = all.filter((a) => {
			if (filter?.brandPromptId && a.brandPromptId !== filter.brandPromptId) return false;
			if (filter?.aiProvider && a.aiProvider !== filter.aiProvider) return false;
			if (filter?.country && a.location.country !== filter.country) return false;
			if (filter?.language && a.location.language !== filter.language) return false;
			if (filter?.from && a.capturedAt.getTime() < filter.from.getTime()) return false;
			if (filter?.to && a.capturedAt.getTime() > filter.to.getTime()) return false;
			return true;
		});
		filtered.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
		return filter?.limit ? filtered.slice(0, filter.limit) : filtered;
	}

	async listLatestForPrompt(
		brandPromptId: AiSearchInsights.BrandPromptId,
		limit: number,
	): Promise<readonly AiSearchInsights.LlmAnswer[]> {
		const all = [...this.byId.values()].filter((a) => a.brandPromptId === brandPromptId);
		all.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
		return all.slice(0, limit);
	}
}
