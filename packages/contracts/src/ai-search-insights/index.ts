import { z } from 'zod';

export const PromptKindSchema = z.enum(['category', 'comparative', 'transactional', 'branded']);
export type PromptKindContract = z.infer<typeof PromptKindSchema>;

export const AiProviderNameSchema = z.enum(['openai', 'anthropic', 'perplexity', 'google-ai-studio']);
export type AiProviderNameContract = z.infer<typeof AiProviderNameSchema>;

export const SentimentSchema = z.enum(['positive', 'neutral', 'negative', 'mixed']);
export type SentimentContract = z.infer<typeof SentimentSchema>;

export const RegisterBrandPromptRequest = z.object({
	text: z.string().min(3).max(1000),
	kind: PromptKindSchema,
});
export type RegisterBrandPromptRequest = z.infer<typeof RegisterBrandPromptRequest>;

export const RegisterBrandPromptResponse = z.object({
	brandPromptId: z.string().uuid(),
});
export type RegisterBrandPromptResponse = z.infer<typeof RegisterBrandPromptResponse>;

export const PauseBrandPromptRequest = z.object({
	paused: z.boolean(),
});
export type PauseBrandPromptRequest = z.infer<typeof PauseBrandPromptRequest>;

export const BrandPromptDtoSchema = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	text: z.string(),
	kind: PromptKindSchema,
	pausedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
});
export type BrandPromptDtoSchema = z.infer<typeof BrandPromptDtoSchema>;

export const ListBrandPromptsResponse = z.object({
	items: z.array(BrandPromptDtoSchema),
});
export type ListBrandPromptsResponse = z.infer<typeof ListBrandPromptsResponse>;

export const BrandMentionDtoSchema = z.object({
	brand: z.string(),
	position: z.number().int().positive(),
	sentiment: SentimentSchema,
	citedUrl: z.string().nullable(),
	isOwnBrand: z.boolean(),
});
export type BrandMentionDtoSchema = z.infer<typeof BrandMentionDtoSchema>;

export const CitationDtoSchema = z.object({
	url: z.string(),
	domain: z.string(),
	isOwnDomain: z.boolean(),
});
export type CitationDtoSchema = z.infer<typeof CitationDtoSchema>;

export const LlmAnswerDtoSchema = z.object({
	id: z.string().uuid(),
	brandPromptId: z.string().uuid(),
	projectId: z.string().uuid(),
	aiProvider: AiProviderNameSchema,
	model: z.string(),
	country: z.string(),
	language: z.string(),
	rawText: z.string(),
	mentions: z.array(BrandMentionDtoSchema),
	citations: z.array(CitationDtoSchema),
	costCents: z.number(),
	capturedAt: z.string().datetime(),
});
export type LlmAnswerDtoSchema = z.infer<typeof LlmAnswerDtoSchema>;

export const ListLlmAnswersQuery = z.object({
	brandPromptId: z.string().uuid().optional(),
	aiProvider: AiProviderNameSchema.optional(),
	country: z
		.string()
		.regex(/^[A-Z]{2}$/)
		.optional(),
	language: z
		.string()
		.regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
		.optional(),
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListLlmAnswersQuery = z.infer<typeof ListLlmAnswersQuery>;

export const ListLlmAnswersResponse = z.object({
	items: z.array(LlmAnswerDtoSchema),
});
export type ListLlmAnswersResponse = z.infer<typeof ListLlmAnswersResponse>;

// ---- dashboards (sub-issue #63) ----

const DashboardWindowQuery = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
});

export const AiSearchPresenceQuery = DashboardWindowQuery;
export type AiSearchPresenceQuery = z.infer<typeof AiSearchPresenceQuery>;

export const AiSearchPresenceResponse = z.object({
	from: z.string().datetime(),
	to: z.string().datetime(),
	totalAnswers: z.number().int().min(0),
	answersWithOwnMention: z.number().int().min(0),
	mentionRate: z.number().min(0).max(1),
	ownCitationCount: z.number().int().min(0),
	citationRate: z.number().min(0),
	ownAvgPosition: z.number().min(1).nullable(),
	competitorMentionCount: z.number().int().min(0),
});
export type AiSearchPresenceResponse = z.infer<typeof AiSearchPresenceResponse>;

export const AiSearchSovQuery = DashboardWindowQuery;
export type AiSearchSovQuery = z.infer<typeof AiSearchSovQuery>;

export const AiSearchSovItem = z.object({
	aiProvider: AiProviderNameSchema,
	country: z.string(),
	language: z.string(),
	brand: z.string(),
	isOwnBrand: z.boolean(),
	totalAnswers: z.number().int().min(0),
	answersWithMention: z.number().int().min(0),
	mentionRate: z.number().min(0).max(1),
	avgPosition: z.number().min(1).nullable(),
	citationCount: z.number().int().min(0),
});
export type AiSearchSovItem = z.infer<typeof AiSearchSovItem>;

export const AiSearchSovResponse = z.object({
	items: z.array(AiSearchSovItem),
});
export type AiSearchSovResponse = z.infer<typeof AiSearchSovResponse>;

export const AiSearchCitationsQuery = DashboardWindowQuery.extend({
	onlyOwnDomains: z.coerce.boolean().optional(),
	aiProvider: AiProviderNameSchema.optional(),
});
export type AiSearchCitationsQuery = z.infer<typeof AiSearchCitationsQuery>;

export const AiSearchCitationItem = z.object({
	url: z.string(),
	domain: z.string(),
	isOwnDomain: z.boolean(),
	totalCitations: z.number().int().min(0),
	providers: z.array(AiProviderNameSchema),
	firstSeenAt: z.string().datetime(),
	lastSeenAt: z.string().datetime(),
});
export type AiSearchCitationItem = z.infer<typeof AiSearchCitationItem>;

export const AiSearchCitationsResponse = z.object({
	items: z.array(AiSearchCitationItem),
});
export type AiSearchCitationsResponse = z.infer<typeof AiSearchCitationsResponse>;

export const AiSearchSovDailyQuery = DashboardWindowQuery;
export type AiSearchSovDailyQuery = z.infer<typeof AiSearchSovDailyQuery>;

export const AiSearchSovDailyPoint = z.object({
	day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	totalAnswers: z.number().int().min(0),
	answersWithOwnMention: z.number().int().min(0),
	mentionRate: z.number().min(0).max(1),
});
export type AiSearchSovDailyPoint = z.infer<typeof AiSearchSovDailyPoint>;

export const AiSearchSovDailyResponse = z.object({
	items: z.array(AiSearchSovDailyPoint),
});
export type AiSearchSovDailyResponse = z.infer<typeof AiSearchSovDailyResponse>;

// ---- competitive matrix + alerts (sub-issue #64) ----

export const CompetitiveMatrixQuery = DashboardWindowQuery;
export type CompetitiveMatrixQuery = z.infer<typeof CompetitiveMatrixQuery>;

export const CompetitiveMatrixCell = z.object({
	aiProvider: AiProviderNameSchema,
	country: z.string(),
	language: z.string(),
	brand: z.string(),
	isOwnBrand: z.boolean(),
	totalAnswers: z.number().int().min(0),
	answersWithMention: z.number().int().min(0),
	mentionRate: z.number().min(0).max(1),
	avgPosition: z.number().min(1).nullable(),
});
export type CompetitiveMatrixCell = z.infer<typeof CompetitiveMatrixCell>;

export const CompetitiveMatrixResponse = z.object({
	items: z.array(CompetitiveMatrixCell),
});
export type CompetitiveMatrixResponse = z.infer<typeof CompetitiveMatrixResponse>;

export const AiSearchAlertKindSchema = z.enum(['BrandLostCitation', 'BrandSoVDropped', 'CompetitorOvertook']);
export type AiSearchAlertKindContract = z.infer<typeof AiSearchAlertKindSchema>;

export const AiSearchAlertSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AiSearchAlertSeverityContract = z.infer<typeof AiSearchAlertSeveritySchema>;

export const AiSearchAlertItem = z.object({
	kind: AiSearchAlertKindSchema,
	severity: AiSearchAlertSeveritySchema,
	aiProvider: AiProviderNameSchema,
	country: z.string(),
	language: z.string(),
	occurredAt: z.string().datetime(),
	subject: z.string(),
	details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});
export type AiSearchAlertItem = z.infer<typeof AiSearchAlertItem>;

export const AiSearchAlertsResponse = z.object({
	items: z.array(AiSearchAlertItem),
});
export type AiSearchAlertsResponse = z.infer<typeof AiSearchAlertsResponse>;
