import { z } from 'zod';

const PixelHandle = z.string().regex(/^\d{8,}$/, 'must be an 8+ digit Meta Pixel id');
const AdAccountHandle = z.string().regex(/^(act_)?\d+$/, 'must be numeric or "act_<digits>"');
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const Level = z.enum(['account', 'campaign', 'adset', 'ad']);

export const LinkMetaPixelRequest = z.object({
	pixelHandle: PixelHandle,
	credentialId: z.string().uuid().nullable().optional(),
});
export type LinkMetaPixelRequest = z.infer<typeof LinkMetaPixelRequest>;

export const MetaPixelDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	pixelHandle: z.string(),
	credentialId: z.string().uuid().nullable(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
	isActive: z.boolean(),
});
export type MetaPixelDto = z.infer<typeof MetaPixelDto>;

export const LinkMetaAdAccountRequest = z.object({
	adAccountHandle: AdAccountHandle,
	credentialId: z.string().uuid().nullable().optional(),
});
export type LinkMetaAdAccountRequest = z.infer<typeof LinkMetaAdAccountRequest>;

export const MetaAdAccountDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	adAccountHandle: z.string(),
	credentialId: z.string().uuid().nullable(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
	isActive: z.boolean(),
});
export type MetaAdAccountDto = z.infer<typeof MetaAdAccountDto>;

export const MetaPixelEventsHistoryQuery = z.object({
	from: DateString,
	to: DateString,
});
export type MetaPixelEventsHistoryQuery = z.infer<typeof MetaPixelEventsHistoryQuery>;

export const MetaPixelEventDailyDto = z.object({
	observedDate: z.string(),
	eventName: z.string(),
	count: z.number().int().nonnegative(),
	// Can be negative — refund / return events net out the purchase value.
	valueSum: z.number(),
});
export type MetaPixelEventDailyDto = z.infer<typeof MetaPixelEventDailyDto>;

export const MetaAdsInsightsHistoryQuery = z.object({
	from: DateString,
	to: DateString,
});
export type MetaAdsInsightsHistoryQuery = z.infer<typeof MetaAdsInsightsHistoryQuery>;

export const MetaAdsInsightDailyDto = z.object({
	observedDate: z.string(),
	level: Level,
	entityId: z.string(),
	entityName: z.string(),
	impressions: z.number().int().nonnegative(),
	clicks: z.number().int().nonnegative(),
	spend: z.number().nonnegative(),
	conversions: z.number().int().nonnegative(),
});
export type MetaAdsInsightDailyDto = z.infer<typeof MetaAdsInsightDailyDto>;
