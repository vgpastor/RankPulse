import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './identity-access.js';
import { projects } from './project-management.js';

export const providerCredentials = pgTable(
	'provider_credentials',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		providerId: text('provider_id').notNull(),
		scopeType: text('scope_type').notNull(),
		scopeId: text('scope_id').notNull(),
		label: text('label').notNull(),
		ciphertext: text('ciphertext').notNull(),
		nonce: text('nonce').notNull(),
		lastFour: text('last_four').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgProviderScopeLabelUnique: uniqueIndex('provider_credentials_unique').on(
			t.organizationId,
			t.providerId,
			t.scopeType,
			t.scopeId,
			t.label,
		),
		orgProviderIdx: index('provider_credentials_org_provider_idx').on(t.organizationId, t.providerId),
	}),
);

export const providerJobDefinitions = pgTable(
	'provider_job_definitions',
	{
		id: uuid('id').primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		providerId: text('provider_id').notNull(),
		endpointId: text('endpoint_id').notNull(),
		paramsHash: text('params_hash').notNull(),
		params: jsonb('params').notNull().$type<Record<string, unknown>>(),
		cron: text('cron').notNull(),
		credentialOverrideId: uuid('credential_override_id').references(() => providerCredentials.id, {
			onDelete: 'set null',
		}),
		enabled: boolean('enabled').notNull().default(true),
		lastRunAt: timestamp('last_run_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqByTuple: uniqueIndex('provider_job_definitions_unique').on(
			t.projectId,
			t.providerId,
			t.endpointId,
			t.paramsHash,
		),
		projectIdx: index('provider_job_definitions_project_idx').on(t.projectId),
	}),
);

export const providerJobRuns = pgTable(
	'provider_job_runs',
	{
		id: uuid('id').primaryKey(),
		definitionId: uuid('definition_id')
			.notNull()
			.references(() => providerJobDefinitions.id, { onDelete: 'cascade' }),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		status: text('status').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		rawPayloadId: uuid('raw_payload_id'),
		errorJson: jsonb('error_json').$type<{ code: string; message: string; retryable: boolean } | null>(),
	},
	(t) => ({
		definitionIdx: index('provider_job_runs_definition_idx').on(t.definitionId, t.startedAt),
	}),
);

export const rawPayloads = pgTable(
	'raw_payloads',
	{
		id: uuid('id').primaryKey(),
		providerId: text('provider_id').notNull(),
		endpointId: text('endpoint_id').notNull(),
		requestHash: text('request_hash').notNull(),
		// Generic provider response — each upstream has its own shape so the
		// `unknown` projection is intentional. Specific repositories cast to
		// the provider's typed payload at read time.
		payload: jsonb('payload').notNull().$type<unknown>(),
		payloadSize: integer('payload_size').notNull(),
		fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		hashUnique: uniqueIndex('raw_payloads_request_hash_unique').on(t.requestHash),
		providerEndpointIdx: index('raw_payloads_provider_endpoint_idx').on(
			t.providerId,
			t.endpointId,
			t.fetchedAt,
		),
	}),
);

export const apiUsageEntries = pgTable(
	'api_usage_entries',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		credentialId: uuid('credential_id')
			.notNull()
			.references(() => providerCredentials.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
		providerId: text('provider_id').notNull(),
		endpointId: text('endpoint_id').notNull(),
		calls: integer('calls').notNull(),
		costMillicents: bigint('cost_millicents', { mode: 'bigint' }).notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgOccurredIdx: index('api_usage_org_occurred_idx').on(t.organizationId, t.occurredAt),
		credIdx: index('api_usage_credential_idx').on(t.credentialId, t.occurredAt),
		projectIdx: index('api_usage_project_idx').on(t.projectId, t.occurredAt),
	}),
);

export type ProviderCredentialRow = typeof providerCredentials.$inferSelect;
export type ProviderJobDefinitionRow = typeof providerJobDefinitions.$inferSelect;
export type ProviderJobRunRow = typeof providerJobRuns.$inferSelect;
export type RawPayloadRow = typeof rawPayloads.$inferSelect;
export type ApiUsageEntryRow = typeof apiUsageEntries.$inferSelect;

export const providerConnectivitySchemaTables = [
	providerCredentials,
	providerJobDefinitions,
	providerJobRuns,
	rawPayloads,
	apiUsageEntries,
] as const;
