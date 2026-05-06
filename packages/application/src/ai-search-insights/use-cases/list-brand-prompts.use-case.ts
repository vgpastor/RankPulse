import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

export interface ListBrandPromptsQuery {
	projectId: string;
}

export interface BrandPromptDto {
	id: string;
	projectId: string;
	text: string;
	kind: AiSearchInsights.PromptKind;
	pausedAt: string | null;
	createdAt: string;
}

export class ListBrandPromptsUseCase {
	constructor(private readonly prompts: AiSearchInsights.BrandPromptRepository) {}

	async execute(query: ListBrandPromptsQuery): Promise<readonly BrandPromptDto[]> {
		const items = await this.prompts.listForProject(query.projectId as ProjectManagement.ProjectId);
		return items.map((p) => ({
			id: p.id,
			projectId: p.projectId,
			text: p.text.value,
			kind: p.kind,
			pausedAt: p.pausedAt?.toISOString() ?? null,
			createdAt: p.createdAt.toISOString(),
		}));
	}
}
