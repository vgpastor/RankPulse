import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { LlmAnswer } from '../entities/llm-answer.js';
import type { AiProviderName } from '../value-objects/ai-provider-name.js';
import type { BrandPromptId, LlmAnswerId } from '../value-objects/identifiers.js';

export interface LlmAnswerListFilter {
	readonly brandPromptId?: BrandPromptId;
	readonly aiProvider?: AiProviderName;
	readonly country?: string;
	readonly language?: string;
	readonly from?: Date;
	readonly to?: Date;
	readonly limit?: number;
}

export interface LlmAnswerRepository {
	save(answer: LlmAnswer): Promise<void>;
	findById(id: LlmAnswerId): Promise<LlmAnswer | null>;
	listForProject(projectId: ProjectId, filter?: LlmAnswerListFilter): Promise<readonly LlmAnswer[]>;
	listLatestForPrompt(brandPromptId: BrandPromptId, limit: number): Promise<readonly LlmAnswer[]>;
}
