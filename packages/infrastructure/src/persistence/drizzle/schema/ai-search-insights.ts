import {
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './identity-access.js';
import { projects } from './project-management.js';

/**
 * Issue #61 / parent #27 — registered prompt the user wants monitored across
 * all connected LLM-search providers (OpenAI/Anthropic/Perplexity/Gemini).
 * One BrandPrompt fans out to N JobDefinitions (`prompt × LocationLanguage ×
 * AiProvider`) via the AutoSchedule handler.
 */
export const brandPrompts = pgTable(
	'brand_prompts',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		text: text('text').notNull(),
		kind: text('kind').notNull(),
		pausedAt: timestamp('paused_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqueByProjectText: uniqueIndex('brand_prompts_project_text_unique').on(t.projectId, t.text),
		projectIdx: index('brand_prompts_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series store of LLM responses captured from a BrandPrompt fan-out.
 * Promoted to a TimescaleDB hypertable (chunk_time_interval = 7d) by the
 * accompanying SQL migration. Compressed after 7 days.
 *
 * `mentions` and `citations` are jsonb because the cardinality per row is
 * small (typically <10) and they're never queried into — the dashboards
 * use the continuous aggregates planned for sub-issue #63 instead. Storing
 * them inline keeps the natural lookup ("show me the answer with its
 * extracted mentions") to a single row read.
 *
 * `raw_text` is kept on the row even though `raw_payload_id` points at a
 * full payload, because the dashboards highlight the mention spans inline
 * and re-fetching the payload jsonb just for that is wasteful.
 */
export const llmAnswers = pgTable(
	'llm_answers',
	{
		capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
		id: uuid('id').notNull(),
		brandPromptId: uuid('brand_prompt_id').notNull(),
		projectId: uuid('project_id').notNull(),
		aiProvider: text('ai_provider').notNull(),
		model: text('model').notNull(),
		country: text('country').notNull(),
		language: text('language').notNull(),
		rawText: text('raw_text').notNull(),
		mentions: jsonb('mentions')
			.notNull()
			.$type<
				readonly {
					brand: string;
					position: number;
					sentiment: string;
					citedUrl: string | null;
					isOwnBrand: boolean;
				}[]
			>()
			.default([]),
		citations: jsonb('citations')
			.notNull()
			.$type<readonly { url: string; domain: string; isOwnDomain: boolean }[]>()
			.default([]),
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
		webSearchCalls: integer('web_search_calls').notNull().default(0),
		costMillicents: bigint('cost_millicents', { mode: 'number' }).notNull().default(0),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.capturedAt, t.id] }),
		promptIdx: index('llm_answers_prompt_idx').on(t.brandPromptId, t.capturedAt),
		projectIdx: index('llm_answers_project_idx').on(t.projectId, t.capturedAt),
		providerIdx: index('llm_answers_provider_locale_idx').on(
			t.projectId,
			t.aiProvider,
			t.country,
			t.language,
			t.capturedAt,
		),
	}),
);

export type BrandPromptRow = typeof brandPrompts.$inferSelect;
export type LlmAnswerRow = typeof llmAnswers.$inferSelect;

export const aiSearchInsightsSchemaTables = [brandPrompts, llmAnswers] as const;
