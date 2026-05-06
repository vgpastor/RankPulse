import { AiSearchInsights } from '@rankpulse/domain';

/**
 * Test stub for the LLM-as-judge port. Lets a unit test pre-program the
 * mentions/usage that the extractor will return for the next call, without
 * touching any external API.
 */
export class ScriptedMentionExtractor implements AiSearchInsights.MentionExtractor {
	private nextResult: AiSearchInsights.MentionExtractorResult = {
		mentions: [],
		judgeTokenUsage: AiSearchInsights.TokenUsage.zero(),
		judgeCostCents: 0,
	};
	public lastInput: AiSearchInsights.MentionExtractorInput | null = null;

	setNext(result: Partial<AiSearchInsights.MentionExtractorResult>): void {
		this.nextResult = {
			mentions: result.mentions ?? [],
			judgeTokenUsage: result.judgeTokenUsage ?? AiSearchInsights.TokenUsage.zero(),
			judgeCostCents: result.judgeCostCents ?? 0,
		};
	}

	async extract(
		input: AiSearchInsights.MentionExtractorInput,
	): Promise<AiSearchInsights.MentionExtractorResult> {
		this.lastInput = input;
		return this.nextResult;
	}
}
