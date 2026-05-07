import {
	bigint,
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
import { providerCredentials } from './provider-connectivity.js';

/**
 * Issue #43 — Microsoft Clarity projects linked to a RankPulse project.
 * Operator-supplied handle is the slug shown in the Clarity URL; the
 * credential pinning is what actually scopes the API calls.
 */
export const clarityProjects = pgTable(
	'clarity_projects',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		clarityHandle: text('clarity_handle').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectHandle: uniqueIndex('clarity_projects_project_handle_unique').on(
			t.projectId,
			t.clarityHandle,
		),
		projectIdx: index('clarity_projects_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of Clarity daily UX metrics. Natural PK
 * (clarity_project_id, observed_date) so daily re-fetches collapse cleanly.
 * Counts are bigint to be safe (high-traffic projects can run into the
 * millions/day); avg_scroll_depth is double precision because it's a
 * fraction in [0,1].
 */
export const clarityDailyMetrics = pgTable(
	'clarity_daily_metrics',
	{
		clarityProjectId: uuid('clarity_project_id')
			.notNull()
			.references(() => clarityProjects.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedDate: text('observed_date').notNull(), // YYYY-MM-DD
		sessionsCount: bigint('sessions_count', { mode: 'number' }).notNull(),
		botSessionsCount: bigint('bot_sessions_count', { mode: 'number' }).notNull(),
		distinctUserCount: bigint('distinct_user_count', { mode: 'number' }).notNull(),
		pagesPerSession: doublePrecision('pages_per_session').notNull(),
		rageClicks: bigint('rage_clicks', { mode: 'number' }).notNull(),
		deadClicks: bigint('dead_clicks', { mode: 'number' }).notNull(),
		avgEngagementSeconds: doublePrecision('avg_engagement_seconds').notNull(),
		avgScrollDepth: doublePrecision('avg_scroll_depth').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.clarityProjectId, t.observedDate] }),
		projectIdx: index('clarity_daily_metrics_project_idx').on(t.projectId, t.observedDate),
	}),
);

export type ClarityProjectRow = typeof clarityProjects.$inferSelect;
export type ClarityDailyMetricRow = typeof clarityDailyMetrics.$inferSelect;

export const experienceAnalyticsSchemaTables = [clarityProjects, clarityDailyMetrics] as const;
