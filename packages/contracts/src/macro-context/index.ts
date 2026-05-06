import { z } from 'zod';

const Domain = z
	.string()
	.regex(
		/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
		'must be a bare domain (no scheme, no path)',
	);

export const AddMonitoredDomainRequest = z.object({
	domain: Domain,
	credentialId: z.string().uuid().nullable().optional(),
});
export type AddMonitoredDomainRequest = z.infer<typeof AddMonitoredDomainRequest>;

export const MonitoredDomainDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	domain: z.string(),
	credentialId: z.string().uuid().nullable(),
	addedAt: z.string().datetime(),
	removedAt: z.string().datetime().nullable(),
	isActive: z.boolean(),
});
export type MonitoredDomainDto = z.infer<typeof MonitoredDomainDto>;

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const RadarHistoryQuery = z.object({
	from: DateString,
	to: DateString,
});
export type RadarHistoryQuery = z.infer<typeof RadarHistoryQuery>;

export const RadarHistoryRowDto = z.object({
	observedDate: z.string(),
	rank: z.number().int().nullable(),
	bucket: z.string().nullable(),
	categories: z.record(z.string(), z.number().int()),
});
export type RadarHistoryRowDto = z.infer<typeof RadarHistoryRowDto>;
