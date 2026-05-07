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
 * Issue #45 — Meta Pixels linked to a project. The handle is the bare
 * numeric pixel id (Meta surfaces pixels as int64 strings in the Graph
 * API). One pixel per (project, handle) tuple.
 */
export const metaPixels = pgTable(
	'meta_pixels',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		pixelHandle: text('pixel_handle').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectHandle: uniqueIndex('meta_pixels_project_handle_unique').on(t.projectId, t.pixelHandle),
		projectIdx: index('meta_pixels_project_idx').on(t.projectId),
	}),
);

/**
 * Issue #45 — Meta ad accounts linked to a project. The handle is the
 * bare numeric `act_<digits>` id without the prefix; the API client
 * adds the prefix when building URLs.
 */
export const metaAdAccounts = pgTable(
	'meta_ad_accounts',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		adAccountHandle: text('ad_account_handle').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectHandle: uniqueIndex('meta_ad_accounts_project_handle_unique').on(
			t.projectId,
			t.adAccountHandle,
		),
		projectIdx: index('meta_ad_accounts_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of Meta Pixel daily events. Natural PK is
 * (meta_pixel_id, observed_date, event_name) — re-running the same
 * window is a no-op (`onConflictDoNothing`).
 */
export const metaPixelEventsDaily = pgTable(
	'meta_pixel_events_daily',
	{
		metaPixelId: uuid('meta_pixel_id')
			.notNull()
			.references(() => metaPixels.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedDate: text('observed_date').notNull(), // YYYY-MM-DD
		eventName: text('event_name').notNull(),
		eventCount: integer('event_count').notNull(),
		valueSum: doublePrecision('value_sum').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.metaPixelId, t.observedDate, t.eventName] }),
		projectIdx: index('meta_pixel_events_daily_project_idx').on(t.projectId, t.observedDate),
	}),
);

/**
 * Time-series of Meta Ads insights at the (account, day, level, entity)
 * granularity. `level` is one of account|campaign|adset|ad and
 * `entity_id` is the corresponding upstream id. `entity_name` is best-
 * effort cached from the response so the read side can label without
 * a Marketing-API roundtrip.
 *
 * `spend` is double precision because Meta returns it as a USD-string
 * with cents — the precision is tighter than float allows for huge
 * accounts, but the read side does its own currency normalisation
 * downstream.
 */
export const metaAdsInsightsDaily = pgTable(
	'meta_ads_insights_daily',
	{
		metaAdAccountId: uuid('meta_ad_account_id')
			.notNull()
			.references(() => metaAdAccounts.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedDate: text('observed_date').notNull(), // YYYY-MM-DD
		level: text('level').notNull(), // account|campaign|adset|ad
		entityId: text('entity_id').notNull(),
		entityName: text('entity_name').notNull().default(''),
		impressions: integer('impressions').notNull(),
		clicks: integer('clicks').notNull(),
		spend: doublePrecision('spend').notNull(),
		conversions: integer('conversions').notNull(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.metaAdAccountId, t.observedDate, t.level, t.entityId] }),
		projectIdx: index('meta_ads_insights_daily_project_idx').on(t.projectId, t.observedDate),
	}),
);

export type MetaPixelRow = typeof metaPixels.$inferSelect;
export type MetaAdAccountRow = typeof metaAdAccounts.$inferSelect;
export type MetaPixelEventDailyRow = typeof metaPixelEventsDaily.$inferSelect;
export type MetaAdsInsightDailyRow = typeof metaAdsInsightsDaily.$inferSelect;

export const metaAdsAttributionSchemaTables = [
	metaPixels,
	metaAdAccounts,
	metaPixelEventsDaily,
	metaAdsInsightsDaily,
] as const;
