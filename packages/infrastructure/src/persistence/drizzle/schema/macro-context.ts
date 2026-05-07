import {
	index,
	integer,
	jsonb,
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
 * Issue #25 — domains whose macro-context (Cloudflare Radar global rank,
 * for now) is snapshotted monthly. Same shape as the other "linked third-
 * party identity" tables: a (project, domain) tuple uniqueness, soft-delete
 * via `removed_at` so historic rank rows stay queryable.
 */
export const monitoredDomains = pgTable(
	'monitored_domains',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
		removedAt: timestamp('removed_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectDomain: uniqueIndex('monitored_domains_project_domain_unique').on(t.projectId, t.domain),
		projectIdx: index('monitored_domains_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of Cloudflare Radar rank snapshots. Natural PK
 * (monitored_domain_id, observed_date) — monthly cron writes one row per
 * domain per month. `rank` is nullable to honour Radar's "domain not in
 * the global ranking" outcome (long-tail). Categories are jsonb because
 * the cardinality is bounded (low single digits) and we never query INTO
 * the JSON.
 */
export const radarRankSnapshots = pgTable(
	'radar_rank_snapshots',
	{
		monitoredDomainId: uuid('monitored_domain_id')
			.notNull()
			.references(() => monitoredDomains.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedDate: text('observed_date').notNull(), // YYYY-MM-DD
		rank: integer('rank'),
		bucket: text('bucket'),
		categories: jsonb('categories').notNull().$type<Record<string, number>>().default({}),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.monitoredDomainId, t.observedDate] }),
		projectIdx: index('radar_rank_snapshots_project_idx').on(t.projectId, t.observedDate),
	}),
);

export type MonitoredDomainRow = typeof monitoredDomains.$inferSelect;
export type RadarRankSnapshotRow = typeof radarRankSnapshots.$inferSelect;

export const macroContextSchemaTables = [monitoredDomains, radarRankSnapshots] as const;
