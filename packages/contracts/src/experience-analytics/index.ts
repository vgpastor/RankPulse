import { z } from 'zod';

const ClarityHandle = z.string().regex(/^[a-zA-Z0-9]{8,32}$/, 'must be 8-32 alphanumeric characters');

export const LinkClarityProjectRequest = z.object({
	clarityHandle: ClarityHandle,
	credentialId: z.string().uuid().nullable().optional(),
});
export type LinkClarityProjectRequest = z.infer<typeof LinkClarityProjectRequest>;

export const ClarityProjectDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	clarityHandle: z.string(),
	credentialId: z.string().uuid().nullable(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
	isActive: z.boolean(),
});
export type ClarityProjectDto = z.infer<typeof ClarityProjectDto>;

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const ExperienceHistoryQuery = z.object({
	from: DateString,
	to: DateString,
});
export type ExperienceHistoryQuery = z.infer<typeof ExperienceHistoryQuery>;

export const ExperienceHistoryRowDto = z.object({
	observedDate: z.string(),
	sessionsCount: z.number().int().nonnegative(),
	botSessionsCount: z.number().int().nonnegative(),
	distinctUserCount: z.number().int().nonnegative(),
	pagesPerSession: z.number().nonnegative(),
	rageClicks: z.number().int().nonnegative(),
	deadClicks: z.number().int().nonnegative(),
	avgEngagementSeconds: z.number().nonnegative(),
	avgScrollDepth: z.number().min(0).max(1),
});
export type ExperienceHistoryRowDto = z.infer<typeof ExperienceHistoryRowDto>;
