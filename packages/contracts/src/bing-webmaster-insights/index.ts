import { z } from 'zod';

export const LinkBingPropertyRequest = z.object({
	siteUrl: z.string().url(),
	credentialId: z.string().uuid().nullable().optional(),
});
export type LinkBingPropertyRequest = z.infer<typeof LinkBingPropertyRequest>;

export const BingPropertyDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	siteUrl: z.string(),
	credentialId: z.string().uuid().nullable(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
	isActive: z.boolean(),
});
export type BingPropertyDto = z.infer<typeof BingPropertyDto>;

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const BingTrafficQuery = z.object({
	from: DateString,
	to: DateString,
});
export type BingTrafficQuery = z.infer<typeof BingTrafficQuery>;

export const BingTrafficObservationDto = z.object({
	observedDate: z.string(),
	clicks: z.number().int().nonnegative(),
	impressions: z.number().int().nonnegative(),
	avgClickPosition: z.number().nullable(),
	avgImpressionPosition: z.number().nullable(),
});
export type BingTrafficObservationDto = z.infer<typeof BingTrafficObservationDto>;
