-- Issue #44 — Brevo (Sendinblue) email + chat engagement tables. Idempotent
-- with IF NOT EXISTS guards so the migration is safe to retry.

CREATE TABLE IF NOT EXISTS "chat_conversations_daily" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"started" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"avg_duration_seconds" integer,
	"raw_payload_id" uuid,
	CONSTRAINT "chat_conversations_daily_project_id_day_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_engagement_daily" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"unique_opened" integer DEFAULT 0 NOT NULL,
	"clicked" integer DEFAULT 0 NOT NULL,
	"unique_clicked" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"unsubscribed" integer DEFAULT 0 NOT NULL,
	"complaints" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"campaign_id" text DEFAULT '' NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "email_engagement_daily_project_id_day_campaign_id_pk" PRIMARY KEY("project_id","day","campaign_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversations_daily_day_idx" ON "chat_conversations_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_engagement_daily_day_idx" ON "email_engagement_daily" USING btree ("day");

-- Promote both tables to TimescaleDB hypertables when the extension is
-- present. Chunk interval = 30 days because Brevo's free tier and our daily
-- cron mean low row-count; coarser chunks reduce metadata overhead without
-- hurting query plans.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'email_engagement_daily',
			'day',
			chunk_time_interval => INTERVAL '30 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		PERFORM create_hypertable(
			'chat_conversations_daily',
			'day',
			chunk_time_interval => INTERVAL '30 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
	END IF;
END
$$;
