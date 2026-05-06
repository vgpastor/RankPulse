import { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, between, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { llmAnswers } from '../../schema/index.js';

const MILLICENTS_PER_CENT = 1_000;

export class DrizzleLlmAnswerRepository implements AiSearchInsights.LlmAnswerRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(a: AiSearchInsights.LlmAnswer): Promise<void> {
		await this.db
			.insert(llmAnswers)
			.values({
				capturedAt: a.capturedAt,
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
				inputTokens: a.tokenUsage.inputTokens,
				outputTokens: a.tokenUsage.outputTokens,
				cachedInputTokens: a.tokenUsage.cachedInputTokens,
				webSearchCalls: a.tokenUsage.webSearchCalls,
				costMillicents: Math.round(a.costCents * MILLICENTS_PER_CENT),
				rawPayloadId: a.rawPayloadId,
			})
			.onConflictDoNothing();
	}

	async findById(id: AiSearchInsights.LlmAnswerId): Promise<AiSearchInsights.LlmAnswer | null> {
		const [row] = await this.db.select().from(llmAnswers).where(eq(llmAnswers.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
		filter?: AiSearchInsights.LlmAnswerListFilter,
	): Promise<readonly AiSearchInsights.LlmAnswer[]> {
		const conds = [eq(llmAnswers.projectId, projectId)];
		if (filter?.brandPromptId) conds.push(eq(llmAnswers.brandPromptId, filter.brandPromptId));
		if (filter?.aiProvider) conds.push(eq(llmAnswers.aiProvider, filter.aiProvider));
		if (filter?.country) conds.push(eq(llmAnswers.country, filter.country));
		if (filter?.language) conds.push(eq(llmAnswers.language, filter.language));
		if (filter?.from && filter?.to) conds.push(between(llmAnswers.capturedAt, filter.from, filter.to));
		else if (filter?.from) conds.push(gte(llmAnswers.capturedAt, filter.from));
		else if (filter?.to) conds.push(lte(llmAnswers.capturedAt, filter.to));

		// Default time-window guard so we don't accidentally scan every chunk
		// in the hypertable when the caller forgets to pass `from`. 30 days
		// is enough for the dashboards' default view.
		if (!filter?.from && !filter?.to) {
			conds.push(gte(llmAnswers.capturedAt, sql<Date>`now() - interval '30 days'`));
		}

		const rows = await this.db
			.select()
			.from(llmAnswers)
			.where(and(...conds))
			.orderBy(desc(llmAnswers.capturedAt))
			.limit(filter?.limit ?? 100);
		return rows.map((r) => this.toAggregate(r));
	}

	async listLatestForPrompt(
		brandPromptId: AiSearchInsights.BrandPromptId,
		limit: number,
	): Promise<readonly AiSearchInsights.LlmAnswer[]> {
		const rows = await this.db
			.select()
			.from(llmAnswers)
			.where(eq(llmAnswers.brandPromptId, brandPromptId))
			.orderBy(desc(llmAnswers.capturedAt))
			.limit(limit);
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof llmAnswers.$inferSelect): AiSearchInsights.LlmAnswer {
		if (!AiSearchInsights.isAiProviderName(row.aiProvider)) {
			throw new InvalidInputError(`Stored llm_answer has invalid ai_provider "${row.aiProvider}"`);
		}
		const mentions = (row.mentions ?? []).map((m) =>
			AiSearchInsights.BrandMention.create({
				brand: m.brand,
				position: m.position,
				sentiment: AiSearchInsights.isSentiment(m.sentiment) ? m.sentiment : 'neutral',
				citedUrl: m.citedUrl ?? null,
			}),
		);
		const citations = (row.citations ?? []).map((c) =>
			AiSearchInsights.Citation.create({
				url: c.url,
				domain: c.domain,
				isOwnDomain: c.isOwnDomain,
			}),
		);
		const tokenUsage = AiSearchInsights.TokenUsage.create({
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
			cachedInputTokens: row.cachedInputTokens,
			webSearchCalls: row.webSearchCalls,
		});

		return AiSearchInsights.LlmAnswer.rehydrate({
			id: row.id as AiSearchInsights.LlmAnswerId,
			brandPromptId: row.brandPromptId as AiSearchInsights.BrandPromptId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			aiProvider: row.aiProvider,
			model: row.model,
			location: ProjectManagement.LocationLanguage.create({
				country: row.country,
				language: row.language,
			}),
			rawText: row.rawText,
			mentions,
			citations,
			tokenUsage,
			costCents: row.costMillicents / MILLICENTS_PER_CENT,
			rawPayloadId: row.rawPayloadId,
			capturedAt: row.capturedAt,
		});
	}
}
