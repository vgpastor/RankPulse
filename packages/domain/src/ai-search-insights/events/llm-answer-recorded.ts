import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { AiProviderName } from '../value-objects/ai-provider-name.js';
import type { BrandPromptId, LlmAnswerId } from '../value-objects/identifiers.js';

/**
 * Emitted when a fresh LlmAnswer is recorded with extracted mentions. Future
 * sub-issues (alerts) listen on this to detect SoV regressions / lost
 * citations across runs.
 */
export class LlmAnswerRecorded implements DomainEvent {
	readonly type = 'LlmAnswerRecorded';
	readonly llmAnswerId: LlmAnswerId;
	readonly brandPromptId: BrandPromptId;
	readonly projectId: ProjectId;
	readonly aiProvider: AiProviderName;
	readonly model: string;
	readonly country: string;
	readonly language: string;
	readonly mentionsOwnBrand: boolean;
	readonly ownPosition: number | null;
	readonly ownCitationCount: number;
	readonly competitorMentionCount: number;
	readonly occurredAt: Date;

	constructor(props: {
		llmAnswerId: LlmAnswerId;
		brandPromptId: BrandPromptId;
		projectId: ProjectId;
		aiProvider: AiProviderName;
		model: string;
		country: string;
		language: string;
		mentionsOwnBrand: boolean;
		ownPosition: number | null;
		ownCitationCount: number;
		competitorMentionCount: number;
		occurredAt: Date;
	}) {
		this.llmAnswerId = props.llmAnswerId;
		this.brandPromptId = props.brandPromptId;
		this.projectId = props.projectId;
		this.aiProvider = props.aiProvider;
		this.model = props.model;
		this.country = props.country;
		this.language = props.language;
		this.mentionsOwnBrand = props.mentionsOwnBrand;
		this.ownPosition = props.ownPosition;
		this.ownCitationCount = props.ownCitationCount;
		this.competitorMentionCount = props.competitorMentionCount;
		this.occurredAt = props.occurredAt;
	}
}
