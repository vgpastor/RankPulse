import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

export interface QueryLlmAnswersQuery {
	projectId: string;
	brandPromptId?: string;
	aiProvider?: AiSearchInsights.AiProviderName;
	country?: string;
	language?: string;
	from?: Date;
	to?: Date;
	limit?: number;
}

export interface BrandMentionDto {
	brand: string;
	position: number;
	sentiment: AiSearchInsights.Sentiment;
	citedUrl: string | null;
	isOwnBrand: boolean;
}

export interface CitationDto {
	url: string;
	domain: string;
	isOwnDomain: boolean;
}

export interface LlmAnswerDto {
	id: string;
	brandPromptId: string;
	projectId: string;
	aiProvider: AiSearchInsights.AiProviderName;
	model: string;
	country: string;
	language: string;
	rawText: string;
	mentions: readonly BrandMentionDto[];
	citations: readonly CitationDto[];
	costCents: number;
	capturedAt: string;
}

export class QueryLlmAnswersUseCase {
	constructor(private readonly answers: AiSearchInsights.LlmAnswerRepository) {}

	async execute(query: QueryLlmAnswersQuery): Promise<readonly LlmAnswerDto[]> {
		const items = await this.answers.listForProject(query.projectId as ProjectManagement.ProjectId, {
			brandPromptId: query.brandPromptId as AiSearchInsights.BrandPromptId | undefined,
			aiProvider: query.aiProvider,
			country: query.country,
			language: query.language,
			from: query.from,
			to: query.to,
			limit: query.limit ?? 50,
		});
		return items.map((a) => ({
			id: a.id,
			brandPromptId: a.brandPromptId,
			projectId: a.projectId,
			aiProvider: a.aiProvider,
			model: a.model,
			country: a.location.country,
			language: a.location.language,
			rawText: a.rawText,
			mentions: a.mentions.map((m) => m.toJSON()),
			citations: a.citations.map((c) => c.toJSON()),
			costCents: a.costCents,
			capturedAt: a.capturedAt.toISOString(),
		}));
	}
}
