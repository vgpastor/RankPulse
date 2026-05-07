import {
	doublePrecision,
	index,
	integer,
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
 * Issue #20 — Bing-verified properties linked to a project. Bing only
 * supports URL-prefix verification (no domain-property analogue), so the
 * unique index is straightforward: one (project, siteUrl) per linkage.
 */
export const bingProperties = pgTable(
	'bing_properties',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		siteUrl: text('site_url').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectSite: uniqueIndex('bing_properties_project_site_unique').on(t.projectId, t.siteUrl),
		projectIdx: index('bing_properties_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of Bing daily traffic. Natural PK is
 * (bing_property_id, observed_date) — re-fetching the same 6-month
 * window swallows the duplicates via onConflictDoNothing.
 *
 * Avg-position columns are nullable: Bing returns null for days with no
 * impressions (avg-of-empty is undefined).
 */
export const bingTrafficObservations = pgTable(
	'bing_traffic_observations',
	{
		bingPropertyId: uuid('bing_property_id')
			.notNull()
			.references(() => bingProperties.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedDate: text('observed_date').notNull(), // YYYY-MM-DD
		clicks: integer('clicks').notNull(),
		impressions: integer('impressions').notNull(),
		avgClickPosition: doublePrecision('avg_click_position'),
		avgImpressionPosition: doublePrecision('avg_impression_position'),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.bingPropertyId, t.observedDate] }),
		projectIdx: index('bing_traffic_observations_project_idx').on(t.projectId, t.observedDate),
	}),
);

export type BingPropertyRow = typeof bingProperties.$inferSelect;
export type BingTrafficObservationRow = typeof bingTrafficObservations.$inferSelect;

export const bingWebmasterInsightsSchemaTables = [bingProperties, bingTrafficObservations] as const;
