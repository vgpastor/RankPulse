// Single Drizzle schema entrypoint: defining tables in one module avoids the
// cross-file `.js` ESM imports that drizzle-kit's CJS loader cannot resolve,
// while keeping `.js` import suffixes everywhere else in the codebase.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// ---- identity-access ----

export const organizations = pgTable(
	'organizations',
	{
		id: uuid('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		slugUnique: uniqueIndex('organizations_slug_unique').on(t.slug),
	}),
);

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey(),
		email: text('email').notNull(),
		name: text('name').notNull(),
		passwordHash: text('password_hash').notNull(),
		locale: text('locale').notNull().default('en'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		emailUnique: uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
	}),
);

export const memberships = pgTable(
	'memberships',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role').notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgUserActiveIdx: uniqueIndex('memberships_org_user_active_unique')
			.on(t.organizationId, t.userId)
			.where(sql`${t.revokedAt} IS NULL`),
		userIdx: index('memberships_user_idx').on(t.userId),
	}),
);

export const apiTokens = pgTable(
	'api_tokens',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		hashedToken: text('hashed_token').notNull(),
		scopes: jsonb('scopes').notNull().$type<readonly string[]>(),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		hashedTokenUnique: uniqueIndex('api_tokens_hashed_unique').on(t.hashedToken),
		orgIdx: index('api_tokens_org_idx').on(t.organizationId),
	}),
);

// ---- project-management ----

export const portfolios = pgTable(
	'portfolios',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgIdx: index('portfolios_org_idx').on(t.organizationId),
	}),
);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		primaryDomain: text('primary_domain').notNull(),
		kind: text('kind').notNull(),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		orgIdx: index('projects_org_idx').on(t.organizationId),
		orgPrimaryDomainUnique: uniqueIndex('projects_org_primary_domain_unique').on(
			t.organizationId,
			t.primaryDomain,
		),
	}),
);

export const projectDomains = pgTable(
	'project_domains',
	{
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		kind: text('kind').notNull(),
	},
	(t) => ({
		projectDomainUnique: uniqueIndex('project_domains_project_domain_unique').on(t.projectId, t.domain),
	}),
);

export const projectLocations = pgTable(
	'project_locations',
	{
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		country: text('country').notNull(),
		language: text('language').notNull(),
	},
	(t) => ({
		projectLocationUnique: uniqueIndex('project_locations_unique').on(t.projectId, t.country, t.language),
	}),
);

export const keywordLists = pgTable(
	'keyword_lists',
	{
		id: uuid('id').primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		projectIdx: index('keyword_lists_project_idx').on(t.projectId),
	}),
);

export const keywords = pgTable(
	'keywords',
	{
		id: uuid('id').primaryKey(),
		listId: uuid('list_id')
			.notNull()
			.references(() => keywordLists.id, { onDelete: 'cascade' }),
		phrase: text('phrase').notNull(),
		tags: jsonb('tags').notNull().$type<readonly string[]>().default([]),
	},
	(t) => ({
		listPhraseUnique: uniqueIndex('keywords_list_phrase_unique').on(t.listId, t.phrase),
	}),
);

export const competitors = pgTable(
	'competitors',
	{
		id: uuid('id').primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		label: text('label').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		projectDomainUnique: uniqueIndex('competitors_project_domain_unique').on(t.projectId, t.domain),
	}),
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type PortfolioRow = typeof portfolios.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectDomainRow = typeof projectDomains.$inferSelect;
export type ProjectLocationRow = typeof projectLocations.$inferSelect;
export type KeywordListRow = typeof keywordLists.$inferSelect;
export type KeywordRow = typeof keywords.$inferSelect;
export type CompetitorRow = typeof competitors.$inferSelect;
