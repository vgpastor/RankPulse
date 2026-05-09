import {
	doublePrecision,
	index,
	integer,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core';
import { projects } from './project-management.js';

/**
 * Issue #128: keyword gaps between our domain and a competitor — keywords the
 * competitor ranks for in top-100 where we either don't rank or rank worse.
 * Sourced from DataForSEO Labs `domain_intersection/live`. Promoted to a
 * TimescaleDB hypertable by migration `0018` with chunk-time = 30 days and a
 * 13-month retention policy (mirrors #127's monthly-snapshot horizon).
 */
export const competitorKeywordGaps = pgTable(
	'competitor_keyword_gaps',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		ourDomain: text('our_domain').notNull(),
		competitorDomain: text('competitor_domain').notNull(),
		keyword: text('keyword').notNull(),
		country: text('country').notNull(),
		language: text('language').notNull(),
		ourPosition: smallint('our_position'),
		theirPosition: smallint('their_position'),
		searchVolume: integer('search_volume'),
		cpc: doublePrecision('cpc'),
		keywordDifficulty: smallint('keyword_difficulty'),
		sourceProvider: text('source_provider').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({
			columns: [t.observedAt, t.projectId, t.ourDomain, t.competitorDomain, t.keyword, t.country, t.language],
		}),
		pairIdx: index('competitor_keyword_gaps_pair_idx').on(
			t.projectId,
			t.ourDomain,
			t.competitorDomain,
			t.observedAt,
		),
		competitorIdx: index('competitor_keyword_gaps_competitor_idx').on(t.competitorDomain, t.observedAt),
	}),
);

export type CompetitorKeywordGapRow = typeof competitorKeywordGaps.$inferSelect;

export const competitorIntelligenceSchemaTables = [competitorKeywordGaps] as const;
