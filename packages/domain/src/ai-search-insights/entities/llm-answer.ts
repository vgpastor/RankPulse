import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { LocationLanguage } from '../../project-management/value-objects/location-language.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { LlmAnswerRecorded } from '../events/llm-answer-recorded.js';
import type { AiProviderName } from '../value-objects/ai-provider-name.js';
import type { BrandMention } from '../value-objects/brand-mention.js';
import type { Citation } from '../value-objects/citation.js';
import type { BrandPromptId, LlmAnswerId } from '../value-objects/identifiers.js';
import type { TokenUsage } from '../value-objects/token-usage.js';

export interface LlmAnswerProps {
	id: LlmAnswerId;
	brandPromptId: BrandPromptId;
	projectId: ProjectId;
	aiProvider: AiProviderName;
	model: string;
	location: LocationLanguage;
	rawText: string;
	mentions: readonly BrandMention[];
	citations: readonly Citation[];
	tokenUsage: TokenUsage;
	costCents: number;
	rawPayloadId: string | null;
	capturedAt: Date;
}

/**
 * One immutable observation of an LLM's response to a tracked BrandPrompt.
 * Stored in a TimescaleDB hypertable partitioned by `capturedAt`. Append-only:
 * once recorded, never mutated. Newer observations are inserted alongside.
 *
 * We keep `rawText` here (not just behind `rawPayloadId`) for two reasons:
 * the dashboards want to highlight the mention spans inline, and the LLM-judge
 * occasionally re-runs against historical answers when we tweak the watchlist
 * (re-extraction without re-billing the LLM-search call).
 */
export class LlmAnswer extends AggregateRoot {
	private constructor(private readonly props: LlmAnswerProps) {
		super();
	}

	static record(input: {
		id: LlmAnswerId;
		brandPromptId: BrandPromptId;
		projectId: ProjectId;
		aiProvider: AiProviderName;
		model: string;
		location: LocationLanguage;
		rawText: string;
		mentions: readonly BrandMention[];
		citations: readonly Citation[];
		tokenUsage: TokenUsage;
		costCents: number;
		rawPayloadId: string | null;
		now: Date;
	}): LlmAnswer {
		// `isOwnBrand` is set by the MentionExtractor against the resolved
		// watchlist — the aggregate just trusts the value rather than re-deriving
		// from citations. That preserves the signal when the LLM mentions our
		// brand by name without citing a URL (a frequent and meaningful case).
		const ownMentions = input.mentions.filter((m) => m.isOwnBrand);
		const competitorMentions = input.mentions.filter((m) => !m.isOwnBrand);
		const firstOwnMention = ownMentions.reduce<BrandMention | null>(
			(best, current) => (best === null || current.position < best.position ? current : best),
			null,
		);
		const ownCitations = input.citations.filter((c) => c.isOwnDomain);

		const answer = new LlmAnswer({
			id: input.id,
			brandPromptId: input.brandPromptId,
			projectId: input.projectId,
			aiProvider: input.aiProvider,
			model: input.model,
			location: input.location,
			rawText: input.rawText,
			mentions: [...input.mentions],
			citations: [...input.citations],
			tokenUsage: input.tokenUsage,
			costCents: input.costCents,
			rawPayloadId: input.rawPayloadId,
			capturedAt: input.now,
		});

		answer.record(
			new LlmAnswerRecorded({
				llmAnswerId: input.id,
				brandPromptId: input.brandPromptId,
				projectId: input.projectId,
				aiProvider: input.aiProvider,
				model: input.model,
				country: input.location.country,
				language: input.location.language,
				mentionsOwnBrand: firstOwnMention !== null,
				ownPosition: firstOwnMention?.position ?? null,
				ownCitationCount: ownCitations.length,
				competitorMentionCount: competitorMentions.length,
				occurredAt: input.now,
			}),
		);
		return answer;
	}

	static rehydrate(props: LlmAnswerProps): LlmAnswer {
		return new LlmAnswer({
			...props,
			mentions: [...props.mentions],
			citations: [...props.citations],
		});
	}

	get id(): LlmAnswerId {
		return this.props.id;
	}
	get brandPromptId(): BrandPromptId {
		return this.props.brandPromptId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get aiProvider(): AiProviderName {
		return this.props.aiProvider;
	}
	get model(): string {
		return this.props.model;
	}
	get location(): LocationLanguage {
		return this.props.location;
	}
	get rawText(): string {
		return this.props.rawText;
	}
	get mentions(): readonly BrandMention[] {
		return this.props.mentions;
	}
	get citations(): readonly Citation[] {
		return this.props.citations;
	}
	get tokenUsage(): TokenUsage {
		return this.props.tokenUsage;
	}
	get costCents(): number {
		return this.props.costCents;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
	get capturedAt(): Date {
		return this.props.capturedAt;
	}
}
