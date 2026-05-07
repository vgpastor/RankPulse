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
 *
 * Natural key is the (observedAt, gscPropertyId, query, page, country,
 * device) tuple. We can't use a composite PK directly because the GSC
 * dimensions are sometimes absent from a row (the API returns the row
 * without that dimension key); we coerce the nullable text columns to
 * empty string with a default so the unique index covers every row
 * without requiring a separate `COALESCE` index.
 */
export const gscObservations = pgTable(
	'gsc_observations',
	{
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		gscPropertyId: uuid('gsc_property_id').notNull(),
		projectId: uuid('project_id').notNull(),
		query: text('query').notNull().default(''),
		page: text('page').notNull().default(''),
		country: text('country').notNull().default(''),
		device: text('device').notNull().default(''),
		clicks: integer('clicks').notNull(),
		impressions: integer('impressions').notNull(),
		ctr: doublePrecision('ctr').notNull(),
		position: doublePrecision('position').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		// PK over the natural key — re-running the same fetch on the same
		// day with the same dimension breakdown is idempotent (the repo
		// uses `onConflictDoNothing` against this PK target).
		pk: primaryKey({
			columns: [t.observedAt, t.gscPropertyId, t.query, t.page, t.country, t.device],
		}),
		projectIdx: index('gsc_observations_project_idx').on(t.projectId, t.observedAt),
	}),
);

export type GscPropertyRow = typeof gscProperties.$inferSelect;
export type GscObservationRow = typeof gscObservations.$inferSelect;

export const searchConsoleInsightsSchemaTables = [gscProperties, gscObservations] as const;
