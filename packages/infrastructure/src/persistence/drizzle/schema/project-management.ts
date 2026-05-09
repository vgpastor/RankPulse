import {
	bigint,
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
import { organizations } from './identity-access.js';

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
		projectDomainUnique: uniqueIndex('competitor_suggestions_project_domain_unique').on(
			t.projectId,
			t.domain,
		),
		projectStatusIdx: index('competitor_suggestions_project_status_idx').on(t.projectId, t.status),
	}),
);

/**
 * Per-day per-source observation of a competitor's external footprint.
 * Issue #117 Sprint 2 — Competitor Activity Radar.
 *
 * Two sources today (Wayback CDX snapshot count + DataForSEO Backlinks
 * summary) write to the same hypertable so the read model can join them
 * per `(competitorId, observed_at::date)`. The natural key is
 * `(observed_at, competitor_id, source)` — ingests truncate `observed_at`
 * to start-of-day-UTC at the aggregate boundary so re-runs overwrite.
 *
 * Promoted to a TimescaleDB hypertable in migration 0017 with a 90-day
 * retention policy (long enough for WoW comparisons + a quarter of trend).
 */
export const competitorActivityObservations = pgTable(
	'competitor_activity_observations',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		competitorId: uuid('competitor_id').notNull(),
		projectId: uuid('project_id').notNull(),
		source: text('source').notNull(),
		// Wayback metrics (null for backlinks rows)
		waybackSnapshotCount: integer('wayback_snapshot_count'),
		waybackLatestSnapshotAt: timestamp('wayback_latest_snapshot_at', { withTimezone: true }),
		waybackEarliestSnapshotAt: timestamp('wayback_earliest_snapshot_at', { withTimezone: true }),
		// Backlinks metrics (null for wayback rows)
		backlinksTotal: bigint('backlinks_total', { mode: 'number' }),
		backlinksReferringDomains: integer('backlinks_referring_domains'),
		backlinksReferringMainDomains: integer('backlinks_referring_main_domains'),
		backlinksReferringPages: bigint('backlinks_referring_pages', { mode: 'number' }),
		backlinksBroken: integer('backlinks_broken'),
		backlinksSpamScore: smallint('backlinks_spam_score'),
		backlinksRank: smallint('backlinks_rank'),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.observedAt, t.competitorId, t.source] }),
		projectIdx: index('competitor_activity_project_idx').on(t.projectId, t.observedAt),
		competitorIdx: index('competitor_activity_competitor_idx').on(t.competitorId, t.observedAt),
	}),
);

export type PortfolioRow = typeof portfolios.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectDomainRow = typeof projectDomains.$inferSelect;
export type ProjectLocationRow = typeof projectLocations.$inferSelect;
export type KeywordListRow = typeof keywordLists.$inferSelect;
export type KeywordRow = typeof keywords.$inferSelect;
export type CompetitorRow = typeof competitors.$inferSelect;
export type CompetitorSuggestionRow = typeof competitorSuggestions.$inferSelect;
export type CompetitorActivityObservationRow = typeof competitorActivityObservations.$inferSelect;

export const projectManagementSchemaTables = [
	portfolios,
	projects,
	projectDomains,
	projectLocations,
	keywordLists,
	keywords,
	competitors,
	competitorSuggestions,
	competitorActivityObservations,
] as const;
