import { bigint, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './identity-access.js';
import { projects } from './project-management.js';

/**
 * Issue #33 — Wikipedia articles linked to a project as brand /
 * competitor / entity-awareness signals. Soft-delete via `unlinkedAt`
 * so historical observations remain queryable after the operator
 * stops tracking the article.
 */
export const wikipediaArticles = pgTable(
	'wikipedia_articles',
	{
		id: uuid('id').primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		wikipediaProject: text('wikipedia_project').notNull(),
		slug: text('slug').notNull(),
		label: text('label').notNull(),
		linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
		unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
	},
	(t) => ({
		uniqueByProjectArticle: uniqueIndex('wikipedia_articles_project_article_unique').on(
			t.projectId,
			t.wikipediaProject,
			t.slug,
		),
		projectIdx: index('wikipedia_articles_project_idx').on(t.projectId),
	}),
);

/**
 * Time-series of Wikipedia pageviews per linked article. PK is the
 * natural key (articleId, observedAt) so re-running the same fetch is
 * idempotent. `views` is bigint because article totals can run into
 * the billions over multi-year ranges.
 */
export const wikipediaPageviews = pgTable(
	'wikipedia_pageviews',
	{
		articleId: uuid('article_id')
			.notNull()
			.references(() => wikipediaArticles.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').notNull(),
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		views: bigint('views', { mode: 'number' }).notNull(),
		access: text('access').notNull(),
		agent: text('agent').notNull(),
		granularity: text('granularity').notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.articleId, t.observedAt] }),
		projectIdx: index('wikipedia_pageviews_project_idx').on(t.projectId, t.observedAt),
	}),
);

export type WikipediaArticleRow = typeof wikipediaArticles.$inferSelect;
export type WikipediaPageviewRow = typeof wikipediaPageviews.$inferSelect;

export const entityAwarenessSchemaTables = [wikipediaArticles, wikipediaPageviews] as const;
