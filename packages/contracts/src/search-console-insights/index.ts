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

// --- Decision Cockpit (issue #117 Sprint 1) ---

export const CockpitWindowQuery = z.object({
	windowDays: z.coerce.number().int().min(7).max(90).optional(),
});
export type CockpitWindowQuery = z.infer<typeof CockpitWindowQuery>;

export const CtrAnomaliesQuery = CockpitWindowQuery.extend({
	minImpressions: z.coerce.number().int().min(1).max(100000).optional(),
});
export type CtrAnomaliesQuery = z.infer<typeof CtrAnomaliesQuery>;

export const CtrAnomalyDto = z.object({
	query: z.string(),
	page: z.string().nullable(),
	impressions: z.number().int(),
	clicks: z.number().int(),
	avgPosition: z.number(),
});
export type CtrAnomalyDto = z.infer<typeof CtrAnomalyDto>;

export const CtrAnomaliesResponse = z.object({
	anomalies: z.array(CtrAnomalyDto),
});
export type CtrAnomaliesResponse = z.infer<typeof CtrAnomaliesResponse>;

export const LostOpportunityQuery = CockpitWindowQuery.extend({
	minImpressions: z.coerce.number().int().min(1).max(100000).optional(),
	targetPosition: z.coerce.number().int().min(1).max(30).optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type LostOpportunityQuery = z.infer<typeof LostOpportunityQuery>;

export const LostOpportunityRowDto = z.object({
	query: z.string(),
	page: z.string().nullable(),
	impressions: z.number().int(),
	clicks: z.number().int(),
	currentPosition: z.number(),
	currentCtr: z.number(),
	targetCtr: z.number(),
	lostClicks: z.number().int(),
});
export type LostOpportunityRowDto = z.infer<typeof LostOpportunityRowDto>;

export const LostOpportunityResponse = z.object({
	rows: z.array(LostOpportunityRowDto),
	totalLostClicks: z.number().int(),
});
export type LostOpportunityResponse = z.infer<typeof LostOpportunityResponse>;

export const QuickWinRoiQuery = CockpitWindowQuery.extend({
	minImpressions: z.coerce.number().int().min(1).max(100000).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type QuickWinRoiQuery = z.infer<typeof QuickWinRoiQuery>;

export const QuickWinRoiRowDto = z.object({
	query: z.string(),
	page: z.string().nullable(),
	impressions: z.number().int(),
	clicks: z.number().int(),
	currentPosition: z.number(),
	projectedClickGain: z.number().int(),
	roiScore: z.number(),
});
export type QuickWinRoiRowDto = z.infer<typeof QuickWinRoiRowDto>;

export const QuickWinRoiResponse = z.object({
	rows: z.array(QuickWinRoiRowDto),
});
export type QuickWinRoiResponse = z.infer<typeof QuickWinRoiResponse>;

export const BrandDecayQuery = CockpitWindowQuery.extend({
	dropAlertPct: z.coerce.number().int().min(1).max(100).optional(),
});
export type BrandDecayQuery = z.infer<typeof BrandDecayQuery>;

const BrandDecayBucketDto = z.object({
	clicksThisWeek: z.number().int(),
	clicksLastWeek: z.number().int(),
	deltaPct: z.number().nullable(),
	topQueries: z.array(z.object({ query: z.string(), clicks: z.number().int() })),
});

export const BrandDecayResponse = z.object({
	branded: BrandDecayBucketDto,
	nonBranded: BrandDecayBucketDto,
	weekStart: z.string().datetime().nullable(),
	priorWeekStart: z.string().datetime().nullable(),
	brandTokens: z.array(z.string()),
	alert: z.boolean(),
	alertReason: z.enum(['no-brand-decay']).nullable(),
});
export type BrandDecayResponse = z.infer<typeof BrandDecayResponse>;
