import { AiSearchInsights, ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

/**
 * The contract the worker fills in when an LLM-search call completes. The
 * provider's ACL produces this DTO from its raw response (each provider has
 * its own response shape but they all converge on this shape).
 */
export interface CapturedLlmResponse {
	readonly aiProvider: AiSearchInsights.AiProviderName;
	readonly model: string;
	readonly rawText: string;
	readonly citationUrls: readonly string[];
	readonly tokenUsage: AiSearchInsights.TokenUsage;
	readonly costCents: number;
}

export interface RecordLlmAnswerCommand {
	brandPromptId: string;
	country: string;
	language: string;
	rawPayloadId: string | null;
	response: CapturedLlmResponse;
}

export interface RecordLlmAnswerResult {
	llmAnswerId: string;
	mentionsExtracted: number;
	citationsExtracted: number;
}

/**
 * Pipeline step called by the worker after a successful LLM-search fetch.
 *
 * 1. Loads the BrandPrompt to confirm it exists and grab the projectId.
 * 2. Resolves the project's brand watchlist (own brand + competitors) via
 *    `BrandWatchlistResolver`.
 * 3. Builds `Citation[]` from the URLs the LLM produced, attributing
 *    `isOwnDomain` against the watchlist's `ownDomains`.
 * 4. Calls the `MentionExtractor` (Anthropic Haiku LLM-judge) with the raw
 *    text and the watchlist to get `BrandMention[]`.
 * 5. Persists the `LlmAnswer` aggregate. Cost = upstream call + extractor.
 */
export class RecordLlmAnswerUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly answers: AiSearchInsights.LlmAnswerRepository,
		private readonly watchlist: AiSearchInsights.BrandWatchlistResolver,
		private readonly extractor: AiSearchInsights.MentionExtractor,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RecordLlmAnswerCommand): Promise<RecordLlmAnswerResult> {
		const brandPromptId = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(brandPromptId);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}

		const projectId = prompt.projectId;
		const watchlist = await this.watchlist.resolveForProject(projectId);
		const ownDomains = watchlist.flatMap((w) => w.ownDomains);
		const citations = cmd.response.citationUrls.map((url) =>
			AiSearchInsights.Citation.fromUrl(url, ownDomains),
		);

		const location = ProjectManagement.LocationLanguage.create({
			country: cmd.country,
			language: cmd.language,
		});

		const extracted = await this.extractor.extract({
			rawText: cmd.response.rawText,
			promptText: prompt.text.value,
			location,
			watchlist,
			citations,
		});

		const totalCostCents = cmd.response.costCents + extracted.judgeCostCents;
		const totalTokens = AiSearchInsights.TokenUsage.create({
			inputTokens: cmd.response.tokenUsage.inputTokens + extracted.judgeTokenUsage.inputTokens,
			outputTokens: cmd.response.tokenUsage.outputTokens + extracted.judgeTokenUsage.outputTokens,
			cachedInputTokens:
				cmd.response.tokenUsage.cachedInputTokens + extracted.judgeTokenUsage.cachedInputTokens,
			webSearchCalls: cmd.response.tokenUsage.webSearchCalls + extracted.judgeTokenUsage.webSearchCalls,
		});

		const id = this.ids.generate() as AiSearchInsights.LlmAnswerId;
		const answer = AiSearchInsights.LlmAnswer.record({
			id,
			brandPromptId,
			projectId,
			aiProvider: cmd.response.aiProvider,
			model: cmd.response.model,
			location,
			rawText: cmd.response.rawText,
			mentions: extracted.mentions,
			citations,
			tokenUsage: totalTokens,
			costCents: totalCostCents,
			rawPayloadId: cmd.rawPayloadId,
			now: this.clock.now(),
		});

		await this.answers.save(answer);
		await this.events.publish(answer.pullEvents());

		return {
			llmAnswerId: id,
			mentionsExtracted: extracted.mentions.length,
			citationsExtracted: citations.length,
		};
	}
}
