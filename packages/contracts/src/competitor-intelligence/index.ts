import { z } from 'zod';

// --- Keyword Gaps (issue #128) ---

export const KeywordGapsQuery = z.object({
	ourDomain: z.string().min(3).max(253),
	competitorDomain: z.string().min(3).max(253),
	limit: z.coerce.number().int().min(1).max(1000).optional(),
	minVolume: z.coerce.number().int().min(0).optional(),
});
export type KeywordGapsQuery = z.infer<typeof KeywordGapsQuery>;

export const KeywordGapsResponseEntry = z.object({
	keyword: z.string(),
	ourPosition: z.number().int().nullable(),
	theirPosition: z.number().int().nullable(),
	searchVolume: z.number().int().nullable(),
	cpc: z.number().nullable(),
	keywordDifficulty: z.number().int().nullable(),
	roiScore: z.number().nullable(),
	observedAt: z.string().datetime(),
});
export type KeywordGapsResponseEntry = z.infer<typeof KeywordGapsResponseEntry>;

export const KeywordGapsResponse = z.object({
	rows: z.array(KeywordGapsResponseEntry),
});
export type KeywordGapsResponse = z.infer<typeof KeywordGapsResponse>;

// --- Competitor Page Audits (issue #131) ---

export const CompetitorPageAuditsQuery = z.object({
	competitorDomain: z.string().min(3).max(253),
	url: z.string().url().optional(),
	limit: z.coerce.number().int().min(1).max(1000).optional(),
});
export type CompetitorPageAuditsQuery = z.infer<typeof CompetitorPageAuditsQuery>;

export const CompetitorPageAuditDto = z.object({
	observedAt: z.string().datetime(),
	competitorDomain: z.string(),
	url: z.string(),
	statusCode: z.number().int().nullable(),
	statusMessage: z.string().nullable(),
	fetchTimeMs: z.number().int().nullable(),
	pageSizeBytes: z.number().int().nullable(),
	title: z.string().nullable(),
	metaDescription: z.string().nullable(),
	h1: z.string().nullable(),
	h2Count: z.number().int().nullable(),
	h3Count: z.number().int().nullable(),
	wordCount: z.number().int().nullable(),
	plainTextSizeBytes: z.number().int().nullable(),
	internalLinksCount: z.number().int().nullable(),
	externalLinksCount: z.number().int().nullable(),
	hasSchemaOrg: z.boolean().nullable(),
	schemaTypes: z.array(z.string()),
	canonicalUrl: z.string().nullable(),
	redirectUrl: z.string().nullable(),
	lcpMs: z.number().int().nullable(),
	cls: z.number().nullable(),
	ttfbMs: z.number().int().nullable(),
	domSize: z.number().int().nullable(),
	isAmp: z.boolean().nullable(),
	isJavascript: z.boolean().nullable(),
	isHttps: z.boolean().nullable(),
	hreflangCount: z.number().int().nullable(),
	ogTagsCount: z.number().int().nullable(),
	sourceProvider: z.string(),
	observedAtProvider: z.string().datetime().nullable(),
});
export type CompetitorPageAuditDto = z.infer<typeof CompetitorPageAuditDto>;

export const CompetitorPageAuditsResponse = z.object({
	rows: z.array(CompetitorPageAuditDto),
});
export type CompetitorPageAuditsResponse = z.infer<typeof CompetitorPageAuditsResponse>;
