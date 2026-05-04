import { z } from 'zod';

export const CredentialScopeRequest = z.object({
	type: z.enum(['org', 'portfolio', 'project', 'domain']),
	id: z.string().min(1),
});
export type CredentialScopeRequest = z.infer<typeof CredentialScopeRequest>;

export const RegisterCredentialRequest = z.object({
	organizationId: z.string().uuid(),
	providerId: z.string().min(1).max(40),
	scope: CredentialScopeRequest,
	label: z.string().min(1).max(80),
	plaintextSecret: z.string().min(1).max(2000),
	expiresAt: z.string().datetime().nullable().optional(),
});
export type RegisterCredentialRequest = z.infer<typeof RegisterCredentialRequest>;

export const ScheduleEndpointRequest = z.object({
	projectId: z.string().uuid(),
	providerId: z.string().min(1),
	endpointId: z.string().min(1),
	params: z.record(z.string(), z.unknown()),
	cron: z.string().min(5).max(80),
	credentialOverrideId: z.string().uuid().nullable().optional(),
});
export type ScheduleEndpointRequest = z.infer<typeof ScheduleEndpointRequest>;

export const EndpointDescriptorDto = z.object({
	id: z.string(),
	category: z.string(),
	displayName: z.string(),
	description: z.string(),
	defaultCron: z.string().nullable(),
	cost: z.object({ unit: z.literal('usd_cents'), amount: z.number() }),
	rateLimit: z.object({ max: z.number(), durationMs: z.number() }),
});
export type EndpointDescriptorDto = z.infer<typeof EndpointDescriptorDto>;

export const ProviderDto = z.object({
	id: z.string(),
	displayName: z.string(),
	authStrategy: z.enum(['apiKey', 'basic', 'oauth2', 'serviceAccount']),
	endpoints: z.array(EndpointDescriptorDto),
});
export type ProviderDto = z.infer<typeof ProviderDto>;
