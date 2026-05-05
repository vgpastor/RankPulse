// Single Drizzle schema entrypoint: defining tables in one module avoids the
// cross-file `.js` ESM imports that drizzle-kit's CJS loader cannot resolve,
// while keeping `.js` import suffixes everywhere else in the codebase.
import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';

// ---- identity-access ----

export const organizations = pgTable(
	'organizations',
	{
		id: uuid('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		slugUnique: uniqueIndex('organizations_slug_unique').on(t.slug),
	}),
);

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey(),
		email: text('email').notNull(),
		name: text('name').notNull(),
		passwordHash: text('password_hash').notNull(),
		locale: text('locale').notNull().default('en'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		emailUnique: uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
	}),
);

export const memberships = pgTable(
	'memberships',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role').notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgUserActiveIdx: uniqueIndex('memberships_org_user_active_unique')
			.on(t.organizationId, t.userId)
			.where(sql`${t.revokedAt} IS NULL`),
		userIdx: index('memberships_user_idx').on(t.userId),
	}),
);

export const apiTokens = pgTable(
	'api_tokens',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		hashedToken: text('hashed_token').notNull(),
		scopes: jsonb('scopes').notNull().$type<readonly string[]>(),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		hashedTokenUnique: uniqueIndex('api_tokens_hashed_unique').on(t.hashedToken),
		orgIdx: index('api_tokens_org_idx').on(t.organizationId),
	}),
);

// ---- project-management ----

export const portfolios = pgTable(
	'portfolios',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgIdx: index('portfolios_org_idx').on(t.organizationId),
	}),
);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		primaryDomain: text('primary_domain').notNull(),
		kind: text('kind').notNull(),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgIdx: index('projects_org_idx').on(t.organizationId),
		orgPrimaryDomainUnique: uniqueIndex('projects_org_primary_domain_unique').on(
			t.organizationId,
			t.primaryDomain,
		),
	}),
);

export const projectDomains = pgTable(
	'project_domains',
	{
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		kind: text('kind').notNull(),
	},
	(t) => ({
		projectDomainUnique: uniqueIndex('project_domains_project_domain_unique').on(t.projectId, t.domain),
	}),
);

export const projectLocations = pgTable(
	'project_locations',
	{
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		country: text('country').notNull(),
		language: text('language').notNull(),
	},
	(t) => ({
		projectLocationUnique: uniqueIndex('project_locations_unique').on(t.projectId, t.country, t.language),
	}),
);

export const keywordLists = pgTable(
	'keyword_lists',
	{
		id: uuid('id').primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		projectIdx: index('keyword_lists_project_idx').on(t.projectId),
	}),
);

export const keywords = pgTable(
	'keywords',
	{
		id: uuid('id').primaryKey(),
		listId: uuid('list_id')
			.notNull()
			.references(() => keywordLists.id, { onDelete: 'cascade' }),
		phrase: text('phrase').notNull(),
		tags: jsonb('tags').notNull().$type<readonly string[]>().default([]),
	},
	(t) => ({
		listPhraseUnique: uniqueIndex('keywords_list_phrase_unique').on(t.listId, t.phrase),
	}),
);

export const competitors = pgTable(
	'competitors',
	{
		id: uuid('id').primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		label: text('label').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		projectDomainUnique: uniqueIndex('competitors_project_domain_unique').on(t.projectId, t.domain),
	}),
);

// BACKLOG #18 — auto-discovered candidates from SERP top-10 hits.
// Stored separately from `competitors` so promotion is an explicit action
// (write to `competitors`, mark suggestion PROMOTED). The keywords-in-top-10
// set is jsonb because the cardinality is bounded by the project's tracked
// keywords (typically <500) and we never query INTO the array.
export const competitorSuggestions = pgTable(
	'competitor_suggestions',
	{
		id: uuid('id').primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		keywordsInTop10: jsonb('keywords_in_top10').notNull().$type<readonly string[]>().default([]),
		totalTop10Hits: integer('total_top10_hits').notNull().default(0),
		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
		status: text('status').notNull().default('PENDING'),
		promotedAt: timestamp('promoted_at', { withTimezone: true }),
		dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
	},
	(t) => ({
		projectDomainUnique: uniqueIndex('competitor_suggestions_project_domain_unique').on(t.projectId, t.domain),
		projectStatusIdx: index('competitor_suggestions_project_status_idx').on(t.projectId, t.status),
	}),
);

// ---- provider-connectivity ----

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
		payload: jsonb('payload').notNull(),
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

// ---- rank-tracking ----

export const trackedKeywords = pgTable(
	'tracked_keywords',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		phrase: text('phrase').notNull(),
		country: text('country').notNull(),
		language: text('language').notNull(),
		device: text('device').notNull(),
		searchEngine: text('search_engine').notNull(),
		pausedAt: timestamp('paused_at', { withTimezone: true }),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqueByTuple: uniqueIndex('tracked_keywords_unique').on(
			t.projectId,
			t.domain,
			t.phrase,
			t.country,
			t.language,
			t.device,
			t.searchEngine,
		),
		projectIdx: index('tracked_keywords_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series store for rank-tracking. Promoted to a TimescaleDB hypertable
 * by the migration `0001` SQL (create_hypertable) — Drizzle owns the table
 * shape, Timescale owns the chunking/compression policies.
 */
export const rankingObservations = pgTable(
	'ranking_observations',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		trackedKeywordId: uuid('tracked_keyword_id').notNull(),
		projectId: uuid('project_id').notNull(),
		domain: text('domain').notNull(),
		phrase: text('phrase').notNull(),
		country: text('country').notNull(),
		language: text('language').notNull(),
		device: text('device').notNull(),
		position: smallint('position'),
		url: text('url'),
		serpFeatures: jsonb('serp_features').notNull().$type<readonly string[]>().default([]),
		sourceProvider: text('source_provider').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.observedAt, t.trackedKeywordId] }),
		keywordIdx: index('ranking_observations_keyword_idx').on(t.trackedKeywordId, t.observedAt),
		projectIdx: index('ranking_observations_project_idx').on(t.projectId, t.observedAt),
	}),
);

// ---- search-console-insights ----

export const gscProperties = pgTable(
	'gsc_properties',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		siteUrl: text('site_url').notNull(),
		propertyType: text('property_type').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectSite: uniqueIndex('gsc_properties_project_site_unique').on(t.projectId, t.siteUrl),
		projectIdx: index('gsc_properties_project_idx').on(t.projectId),
	}),
);

/**
 * GSC search-analytics rows. Promoted to a Timescale hypertable when the
 * extension is available (see migration 0003).
 */
export const gscObservations = pgTable(
	'gsc_observations',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		gscPropertyId: uuid('gsc_property_id').notNull(),
		projectId: uuid('project_id').notNull(),
		query: text('query'),
		page: text('page'),
		country: text('country'),
		device: text('device'),
		clicks: integer('clicks').notNull(),
		impressions: integer('impressions').notNull(),
		ctr: doublePrecision('ctr').notNull(),
		position: doublePrecision('position').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		propertyIdx: index('gsc_observations_property_idx').on(t.gscPropertyId, t.observedAt),
		projectIdx: index('gsc_observations_project_idx').on(t.projectId, t.observedAt),
	}),
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type PortfolioRow = typeof portfolios.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectDomainRow = typeof projectDomains.$inferSelect;
export type ProjectLocationRow = typeof projectLocations.$inferSelect;
export type KeywordListRow = typeof keywordLists.$inferSelect;
export type KeywordRow = typeof keywords.$inferSelect;
export type CompetitorRow = typeof competitors.$inferSelect;
export type CompetitorSuggestionRow = typeof competitorSuggestions.$inferSelect;
export type ProviderCredentialRow = typeof providerCredentials.$inferSelect;
export type ProviderJobDefinitionRow = typeof providerJobDefinitions.$inferSelect;
export type ProviderJobRunRow = typeof providerJobRuns.$inferSelect;
export type RawPayloadRow = typeof rawPayloads.$inferSelect;
export type ApiUsageEntryRow = typeof apiUsageEntries.$inferSelect;
export type TrackedKeywordRow = typeof trackedKeywords.$inferSelect;
export type RankingObservationRow = typeof rankingObservations.$inferSelect;
export type GscPropertyRow = typeof gscProperties.$inferSelect;
export type GscObservationRow = typeof gscObservations.$inferSelect;
