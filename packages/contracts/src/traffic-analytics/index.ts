import { z } from 'zod';

const PropertyHandle = z.string().regex(/^(properties\/)?\d+$/, 'must be a numeric GA4 property id');

export const LinkGa4PropertyRequest = z.object({
	propertyHandle: PropertyHandle,
	credentialId: z.string().uuid().nullable().optional(),
});
export type LinkGa4PropertyRequest = z.infer<typeof LinkGa4PropertyRequest>;

export const Ga4PropertyDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	propertyHandle: z.string(),
	credentialId: z.string().uuid().nullable(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
	isActive: z.boolean(),
});
export type Ga4PropertyDto = z.infer<typeof Ga4PropertyDto>;

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const Ga4MetricsQuery = z.object({
	from: DateString,
	to: DateString,
});
export type Ga4MetricsQuery = z.infer<typeof Ga4MetricsQuery>;

export const Ga4DailyMetricDto = z.object({
	observedDate: z.string(),
	dimensions: z.record(z.string(), z.string()),
	metrics: z.record(z.string(), z.number()),
});
export type Ga4DailyMetricDto = z.infer<typeof Ga4DailyMetricDto>;
