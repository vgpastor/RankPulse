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
