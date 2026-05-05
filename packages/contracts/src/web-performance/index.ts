import { z } from 'zod';

export const PageSpeedStrategySchema = z.enum(['mobile', 'desktop']);
export type PageSpeedStrategyDto = z.infer<typeof PageSpeedStrategySchema>;

export const TrackPageRequest = z.object({
	url: z.string().url(),
	strategy: PageSpeedStrategySchema,
});
export type TrackPageRequest = z.infer<typeof TrackPageRequest>;

export const TrackedPageDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	url: z.string(),
	strategy: PageSpeedStrategySchema,
	addedAt: z.string().datetime(),
});
export type TrackedPageDto = z.infer<typeof TrackedPageDto>;

export const PageSpeedHistoryQuery = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
});
export type PageSpeedHistoryQuery = z.infer<typeof PageSpeedHistoryQuery>;

export const PageSpeedSnapshotDto = z.object({
	observedAt: z.string().datetime(),
	lcpMs: z.number().nonnegative().nullable(),
	inpMs: z.number().nonnegative().nullable(),
	cls: z.number().nonnegative().nullable(),
	fcpMs: z.number().nonnegative().nullable(),
	ttfbMs: z.number().nonnegative().nullable(),
	performanceScore: z.number().min(0).max(1).nullable(),
	seoScore: z.number().min(0).max(1).nullable(),
	accessibilityScore: z.number().min(0).max(1).nullable(),
	bestPracticesScore: z.number().min(0).max(1).nullable(),
});
export type PageSpeedSnapshotDto = z.infer<typeof PageSpeedSnapshotDto>;
