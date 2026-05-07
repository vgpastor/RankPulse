import { date, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

/**
 * Brevo (Sendinblue) email + chat aggregates. The bounded context that owns
 * these tables hasn't been wired in `domain/application` yet — they were
 * shipped as forward-looking infrastructure for the engagement domain. When
 * the context lands, register these in its `ContextModule.schemaTables`.
 */

/**
 * Issue #44 — daily aggregates of Brevo (Sendinblue) email + transactional
 * activity. Natural PK is (project_id, day) so re-running the same day's
 * cron is idempotent. Promoted to a TimescaleDB hypertable on `day` when
 * the extension is available (see migration 0010).
 *
 * Counts are non-negative integers; the ACL coerces NaN/negative to 0
 * before insert. `complaints` (recipient-marked spam) is split from
 * `blocked` (server-side block) on purpose — both signals matter and
 * conflating them would drop information.
 */
export const emailEngagementDaily = pgTable(
	'email_engagement_daily',
	{
		projectId: uuid('project_id').notNull(),
		// `date` (PostgreSQL DATE, no time component) so TimescaleDB can
		// promote this table to a hypertable on `day` directly. We treat
		// the calendar day as UTC across the codebase.
		day: date('day').notNull(),
		sent: integer('sent').notNull().default(0),
		delivered: integer('delivered').notNull().default(0),
		opened: integer('opened').notNull().default(0),
		uniqueOpened: integer('unique_opened').notNull().default(0),
		clicked: integer('clicked').notNull().default(0),
		uniqueClicked: integer('unique_clicked').notNull().default(0),
		bounced: integer('bounced').notNull().default(0),
		unsubscribed: integer('unsubscribed').notNull().default(0),
		complaints: integer('complaints').notNull().default(0),
		blocked: integer('blocked').notNull().default(0),
		invalid: integer('invalid').notNull().default(0),
		// Sentinel `''` (empty string) marks the global aggregate row from
		// email-statistics. Brevo campaign ids are always positive integers
		// stringified, so `''` never collides. NOT NULL because the column is
		// part of the PK and Postgres rejects NULL in PK columns anyway —
		// being explicit here avoids the subtle runtime failure.
		campaignId: text('campaign_id').notNull().default(''),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.projectId, t.day, t.campaignId] }),
		dayIdx: index('email_engagement_daily_day_idx').on(t.day),
	}),
);

/**
 * Issue #44 — daily aggregates of Brevo Conversations widget activity.
 * `started` and `completed` are independent counters because a conversation
 * can start on one day and complete on the next; the ACL buckets them on
 * the calendar day each event landed (UTC). `avg_duration_seconds` is
 * NULL when no conversation completed on that day — never `0` for missing,
 * because zero is a legitimate value (instant abandon).
 */
export const chatConversationsDaily = pgTable(
	'chat_conversations_daily',
	{
		projectId: uuid('project_id').notNull(),
		day: date('day').notNull(),
		started: integer('started').notNull().default(0),
		completed: integer('completed').notNull().default(0),
		avgDurationSeconds: integer('avg_duration_seconds'),
		rawPayloadId: uuid('raw_payload_id'),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.projectId, t.day] }),
		dayIdx: index('chat_conversations_daily_day_idx').on(t.day),
	}),
);

export type EmailEngagementDailyRow = typeof emailEngagementDaily.$inferSelect;
export type ChatConversationsDailyRow = typeof chatConversationsDaily.$inferSelect;

export const engagementSchemaTables = [emailEngagementDaily, chatConversationsDaily] as const;
