import {
	doublePrecision,
	index,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './identity-access.js';
import { projects } from './project-management.js';

/**
 * Issue #18 — pages tracked for PSI / Core Web Vitals. Same URL with
 * mobile vs desktop strategies counts as two separate tracked pages so
 * the worker fires two PSI calls per day.
 */
export const trackedPages = pgTable(
	'tracked_pages',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		strategy: text('strategy').notNull(),
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqueByTuple: uniqueIndex('tracked_pages_project_url_strategy_unique').on(
			t.projectId,
			t.url,
			t.strategy,
		),
		projectIdx: index('tracked_pages_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of PSI observations. PK is (tracked_page_id, observed_at)
 * so re-running the same fetch on the same minute is a no-op.
 * `*_ms` and score columns nullable: PSI returns null for buckets
 * without enough CrUX data; we persist what we got.
 */
export const pageSpeedSnapshots = pgTable(
	'page_speed_snapshots',
	{
		trackedPageId: uuid('tracked_page_id')
			.notNull()
			.references(() => trackedPages.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		lcpMs: doublePrecision('lcp_ms'),
		inpMs: doublePrecision('inp_ms'),
		cls: doublePrecision('cls'),
		fcpMs: doublePrecision('fcp_ms'),
		ttfbMs: doublePrecision('ttfb_ms'),
		performanceScore: doublePrecision('performance_score'),
		seoScore: doublePrecision('seo_score'),
		accessibilityScore: doublePrecision('accessibility_score'),
		bestPracticesScore: doublePrecision('best_practices_score'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.trackedPageId, t.observedAt] }),
		projectIdx: index('page_speed_snapshots_project_idx').on(t.projectId, t.observedAt),
	}),
);

export type TrackedPageRow = typeof trackedPages.$inferSelect;
export type PageSpeedSnapshotRow = typeof pageSpeedSnapshots.$inferSelect;

export const webPerformanceSchemaTables = [trackedPages, pageSpeedSnapshots] as const;
