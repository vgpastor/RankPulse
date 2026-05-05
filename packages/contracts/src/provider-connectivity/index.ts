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
	/**
	 * Optional. When present, the worker will materialize a
	 * `RankingObservation` per fetched SERP and link it to this tracked
	 * keyword. Without it, the fetch still runs and stores the raw payload
	 * but no observation is created — useful for ad-hoc audits, but the
	 * usual happy-path is to pass the trackedKeywordId so quota is not
	 * spent without persistent results (BACKLOG #9).
	 */
	trackedKeywordId: z.string().uuid().nullable().optional(),
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

export const JobDefinitionDto = z.object({
	id: z.string(),
	projectId: z.string(),
	providerId: z.string(),
	endpointId: z.string(),
	params: z.record(z.string(), z.unknown()),
	cron: z.string(),
	credentialOverrideId: z.string().nullable(),
	enabled: z.boolean(),
	lastRunAt: z.string().nullable(),
	createdAt: z.string(),
});
export type JobDefinitionDto = z.infer<typeof JobDefinitionDto>;

export const UpdateJobDefinitionRequest = z
	.object({
		cron: z.string().min(5).max(80).optional(),
		params: z.record(z.string(), z.unknown()).optional(),
		enabled: z.boolean().optional(),
	})
	.refine((v) => v.cron !== undefined || v.params !== undefined || v.enabled !== undefined, {
		message: 'At least one of cron, params, enabled must be provided',
	});
export type UpdateJobDefinitionRequest = z.infer<typeof UpdateJobDefinitionRequest>;

export const JobRunDto = z.object({
	id: z.string(),
	definitionId: z.string(),
	credentialId: z.string().nullable(),
	status: z.enum(['running', 'succeeded', 'failed', 'skipped']),
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	rawPayloadId: z.string().nullable(),
	error: z
		.object({
			code: z.string(),
			message: z.string(),
			retryable: z.boolean(),
		})
		.nullable(),
});
export type JobRunDto = z.infer<typeof JobRunDto>;
