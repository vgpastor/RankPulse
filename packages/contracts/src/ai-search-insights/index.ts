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
