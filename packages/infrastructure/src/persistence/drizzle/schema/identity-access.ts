import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;

export const identityAccessSchemaTables = [organizations, users, memberships, apiTokens] as const;
