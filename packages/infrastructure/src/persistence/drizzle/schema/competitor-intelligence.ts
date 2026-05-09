import {
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

/**
 * Issue #131: fat snapshot of a competitor URL on-page audit (DataForSEO
 * `on_page/instant_pages`). Promoted to a TimescaleDB hypertable by migration
 * `0020` with chunk-time = 30 days and a 13-month retention policy.
 *
 * `raw_payloads` stores the full DataForSEO response so the ACL can be
 * re-run for backfills if we add columns later — only PK + sourceProvider
 * are required here; every other column is nullable on purpose.
 */
export const competitorPageAudits = pgTable(
	'competitor_page_audits',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		competitorDomain: text('competitor_domain').notNull(),
		url: text('url').notNull(),
		statusCode: smallint('status_code'),
		statusMessage: text('status_message'),
		fetchTimeMs: integer('fetch_time_ms'),
		pageSizeBytes: integer('page_size_bytes'),
		title: text('title'),
		metaDescription: text('meta_description'),
		h1: text('h1'),
		h2Count: smallint('h2_count'),
		h3Count: smallint('h3_count'),
		wordCount: integer('word_count'),
		plainTextSizeBytes: integer('plain_text_size_bytes'),
		internalLinksCount: integer('internal_links_count'),
		externalLinksCount: integer('external_links_count'),
		hasSchemaOrg: boolean('has_schema_org'),
		schemaTypes: jsonb('schema_types').$type<string[]>(),
		canonicalUrl: text('canonical_url'),
		redirectUrl: text('redirect_url'),
		lcpMs: integer('lcp_ms'),
		cls: doublePrecision('cls'),
		ttfbMs: integer('ttfb_ms'),
		domSize: integer('dom_size'),
		isAmp: boolean('is_amp'),
		isJavascript: boolean('is_javascript'),
		isHttps: boolean('is_https'),
		hreflangCount: smallint('hreflang_count'),
		ogTagsCount: smallint('og_tags_count'),
		sourceProvider: text('source_provider').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
		observedAtProvider: timestamp('observed_at_provider', { withTimezone: true }),
	},
	(t) => ({
		pk: primaryKey({
			columns: [t.observedAt, t.projectId, t.competitorDomain, t.url],
		}),
		pairIdx: index('competitor_page_audits_pair_idx').on(t.projectId, t.competitorDomain, t.observedAt),
		domainIdx: index('competitor_page_audits_domain_idx').on(t.competitorDomain, t.observedAt),
	}),
);

export type CompetitorPageAuditRow = typeof competitorPageAudits.$inferSelect;

export const competitorIntelligenceSchemaTables = [competitorKeywordGaps, competitorPageAudits] as const;
