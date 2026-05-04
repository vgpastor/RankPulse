import { z } from 'zod';

export const GscPropertyTypeSchema = z.enum(['URL_PREFIX', 'DOMAIN']);
export type GscPropertyTypeDto = z.infer<typeof GscPropertyTypeSchema>;

export const LinkGscPropertyRequest = z.object({
	projectId: z.string().uuid(),
	siteUrl: z.string().min(3).max(500),
	propertyType: GscPropertyTypeSchema,
	credentialId: z.string().uuid().nullable().optional(),
});
export type LinkGscPropertyRequest = z.infer<typeof LinkGscPropertyRequest>;

export const GscPropertyDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	siteUrl: z.string(),
	propertyType: GscPropertyTypeSchema,
	credentialId: z.string().uuid().nullable(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
});
export type GscPropertyDto = z.infer<typeof GscPropertyDto>;

export const GscPerformanceQuery = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
	query: z.string().optional(),
	page: z.string().optional(),
	country: z.string().optional(),
	device: z.string().optional(),
});
export type GscPerformanceQuery = z.infer<typeof GscPerformanceQuery>;

export const GscPerformancePointDto = z.object({
	observedAt: z.string().datetime(),
	query: z.string().nullable(),
	page: z.string().nullable(),
	country: z.string().nullable(),
	device: z.string().nullable(),
	clicks: z.number().int(),
	impressions: z.number().int(),
	ctr: z.number(),
	position: z.number(),
});
export type GscPerformancePointDto = z.infer<typeof GscPerformancePointDto>;
