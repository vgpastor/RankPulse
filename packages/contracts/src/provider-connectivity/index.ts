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
	plaintextSecret: z.string().min(1).max(8192),
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
	 * Free-form bag of orchestration fields the worker reads alongside
	 * `params` — typically `{ organizationId, projectId, phrase, country,
	 * language, device }` for SERP fan-out (BACKLOG #15). Merged AFTER the
	 * Zod paramsSchema strip so it survives strict provider schemas.
	 */
	systemParams: z.record(z.string(), z.unknown()).optional(),
});
export type ScheduleEndpointRequest = z.infer<typeof ScheduleEndpointRequest>;

export const EndpointDescriptorDto = z.object({
	id: z.string(),
	category: z.string(),
	displayName: z.string(),
	description: z.string(),
	// BACKLOG #21 — every endpoint declares a default cron (no null fallback).
	defaultCron: z.string(),
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
		/**
		 * Patch the orchestration bag (`targetDomain`, `ourDomain`,
		 * `competitorDomain`, `scope`, …) — keys the auto-schedule handler
		 * stamps but the operator may need to fix on a misconfigured def
		 * (#149). Merged ON TOP of the existing params; the use case still
		 * preserves the entity-bound system keys (organizationId,
		 * gscPropertyId, …) from the existing def via the same whitelist
		 * used for `params` patches.
		 */
		systemParams: z.record(z.string(), z.unknown()).optional(),
	})
	// `.strict()` rejects unknown fields with 400 instead of silently dropping
	// them — pre-#149 the schema accepted arbitrary keys (including `systemParams`
	// itself) and the use case never saw them, leaving the operator with a 200
	// OK response and a still-broken schedule.
	.strict()
	.refine(
		(v) =>
			v.cron !== undefined ||
			v.params !== undefined ||
			v.enabled !== undefined ||
			v.systemParams !== undefined,
		{
			message: 'At least one of cron, params, enabled, systemParams must be provided',
		},
	);
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
