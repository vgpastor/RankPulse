import {
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
import { organizations } from './identity-access.js';
import { projects } from './project-management.js';

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

/**
 * Daily snapshot of the SERP top-N for each (project, phrase, country,
 * language, device) the project tracks. Promoted to a TimescaleDB hypertable
 * by migration `0016` with a 7-day retention policy — that's enough horizon
 * for the SERP-map UI and competitor-suggestion derivation while keeping the
 * row count bounded (issue #115).
 *
 * `observed_at` is normalised to start-of-day-UTC at the aggregate boundary
 * so re-running a fetch later in the same day overwrites the snapshot
 * idempotently. The composite PK (observed_at + projectId + phrase +
 * country + language + device + rank) makes that natural.
 */
export const serpObservations = pgTable(
	'serp_observations',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		projectId: uuid('project_id').notNull(),
		phrase: text('phrase').notNull(),
		country: text('country').notNull(),
		language: text('language').notNull(),
		device: text('device').notNull(),
		rank: smallint('rank').notNull(),
		domain: text('domain').notNull(),
		url: text('url'),
		title: text('title'),
		sourceProvider: text('source_provider').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({
			columns: [t.observedAt, t.projectId, t.phrase, t.country, t.language, t.device, t.rank],
		}),
		projectIdx: index('serp_observations_project_idx').on(t.projectId, t.observedAt),
		projectKeywordIdx: index('serp_observations_project_keyword_idx').on(t.projectId, t.phrase, t.observedAt),
		projectDomainIdx: index('serp_observations_project_domain_idx').on(t.projectId, t.domain, t.observedAt),
	}),
);

/**
 * Issue #127: keyword universe of a target domain, sourced from
 * DataForSEO Labs `ranked_keywords/live`. One row per (domain × keyword ×
 * locale × snapshot). Promoted to a TimescaleDB hypertable by migration
 * `0017` with chunk-time = 30 days and a 13-month retention policy — the
 * default schedule is monthly so 13 months keeps the trailing year of
 * snapshots available for trend deltas.
 */
export const rankedKeywordsObservations = pgTable(
	'ranked_keywords_observations',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		projectId: uuid('project_id').notNull(),
		targetDomain: text('target_domain').notNull(),
		keyword: text('keyword').notNull(),
		country: text('country').notNull(),
		language: text('language').notNull(),
		position: smallint('position'),
		searchVolume: integer('search_volume'),
		keywordDifficulty: smallint('keyword_difficulty'),
		trafficEstimate: doublePrecision('traffic_estimate'),
		cpc: doublePrecision('cpc'),
		rankingUrl: text('ranking_url'),
		sourceProvider: text('source_provider').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({
			columns: [t.observedAt, t.projectId, t.targetDomain, t.keyword, t.country, t.language],
		}),
		targetIdx: index('ranked_keywords_observations_target_idx').on(t.targetDomain, t.observedAt),
		projectTargetIdx: index('ranked_keywords_observations_project_target_idx').on(
			t.projectId,
			t.targetDomain,
			t.observedAt,
		),
	}),
);

export type TrackedKeywordRow = typeof trackedKeywords.$inferSelect;
export type RankingObservationRow = typeof rankingObservations.$inferSelect;
export type SerpObservationRow = typeof serpObservations.$inferSelect;
export type RankedKeywordObservationRow = typeof rankedKeywordsObservations.$inferSelect;

export const rankTrackingSchemaTables = [
	trackedKeywords,
	rankingObservations,
	serpObservations,
	rankedKeywordsObservations,
] as const;
