import { z } from 'zod';

export const StartTrackingKeywordRequest = z.object({
	projectId: z.string().uuid(),
	domain: z.string().min(3).max(253),
	phrase: z.string().min(1).max(200),
	country: z.string().regex(/^[A-Z]{2}$/),
	language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	device: z.enum(['desktop', 'mobile']).optional(),
});
export type StartTrackingKeywordRequest = z.infer<typeof StartTrackingKeywordRequest>;

export const RankingHistoryQuery = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
});
export type RankingHistoryQuery = z.infer<typeof RankingHistoryQuery>;

export const RankingHistoryEntryDto = z.object({
	observedAt: z.string().datetime(),
	position: z.number().nullable(),
	url: z.string().nullable(),
	serpFeatures: z.array(z.string()).readonly(),
	sourceProvider: z.string(),
});
export type RankingHistoryEntryDto = z.infer<typeof RankingHistoryEntryDto>;
