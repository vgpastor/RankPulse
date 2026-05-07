import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './identity-access.js';
import { projects } from './project-management.js';
import { providerCredentials } from './provider-connectivity.js';

/**
 * Issue #17 — GA4 properties linked to a project. The handle is the bare
 * numeric form (without the `properties/` prefix); the unique index
 * enforces one mapping per project regardless of how the user typed it
 * because the domain VO canonicalises before save.
 */
export const ga4Properties = pgTable(
	'ga4_properties',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		propertyHandle: text('property_handle').notNull(),
		credentialId: uuid('credential_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectHandle: uniqueIndex('ga4_properties_project_handle_unique').on(
			t.projectId,
			t.propertyHandle,
		),
		projectIdx: index('ga4_properties_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of GA4 daily metrics. Natural PK is
 * (ga4_property_id, observed_date, dimensions_hash) — the application layer
 * computes a stable SHA-256 over the canonical dimensions JSON before the
 * write so re-fetching the same window with the same dimension set is a
 * no-op. Dimensions and metrics are stored as jsonb because the cardinality
 * is bounded per request (max 9 dims, 10 metrics) and we never query INTO
 * the JSON — the read side picks specific keys.
 */
export const ga4DailyMetrics = pgTable(
	'ga4_daily_metrics',
	{
		ga4PropertyId: uuid('ga4_property_id')
			.notNull()
			.references(() => ga4Properties.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedDate: text('observed_date').notNull(), // YYYY-MM-DD
		dimensionsHash: text('dimensions_hash').notNull(),
		dimensions: jsonb('dimensions').notNull().$type<Record<string, string>>(),
		metrics: jsonb('metrics').notNull().$type<Record<string, number>>(),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.ga4PropertyId, t.observedDate, t.dimensionsHash] }),
		projectIdx: index('ga4_daily_metrics_project_idx').on(t.projectId, t.observedDate),
	}),
);

export type Ga4PropertyRow = typeof ga4Properties.$inferSelect;
export type Ga4DailyMetricRow = typeof ga4DailyMetrics.$inferSelect;

export const trafficAnalyticsSchemaTables = [ga4Properties, ga4DailyMetrics] as const;
