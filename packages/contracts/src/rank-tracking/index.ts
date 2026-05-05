import { z } from 'zod';

/**
 * Optional auto-schedule envelope. When present, the controller will also
 * create a JobDefinition wired to the tracked keyword
 * (`params.trackedKeywordId`) so the worker materializes RankingObservation
 * rows on every fetch — no need for a second POST /providers/.../schedule
 * call (BACKLOG #9 opción A).
 */
export const AutoScheduleSerp = z.object({
	providerId: z.string().min(1),
	endpointId: z.string().min(1),
	cron: z.string().min(5).max(80),
	/** Provider-specific params (e.g. DataForSEO needs keyword + locationCode + languageCode + device). */
	params: z.record(z.string(), z.unknown()),
	credentialOverrideId: z.string().uuid().nullable().optional(),
});
export type AutoScheduleSerp = z.infer<typeof AutoScheduleSerp>;

export const StartTrackingKeywordRequest = z.object({
	projectId: z.string().uuid(),
	domain: z.string().min(3).max(253),
	phrase: z.string().min(1).max(200),
	country: z.string().regex(/^[A-Z]{2}$/),
	language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	device: z.enum(['desktop', 'mobile']).optional(),
	autoSchedule: AutoScheduleSerp.optional(),
});
export type StartTrackingKeywordRequest = z.infer<typeof StartTrackingKeywordRequest>;

export const StartTrackingKeywordResponse = z.object({
	trackedKeywordId: z.string(),
	scheduledDefinitionId: z.string().nullable(),
});
export type StartTrackingKeywordResponse = z.infer<typeof StartTrackingKeywordResponse>;

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
