CREATE TABLE IF NOT EXISTS "competitor_activity_observations" (
	"observed_at" timestamp with time zone NOT NULL,
	"competitor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source" text NOT NULL,
	"wayback_snapshot_count" integer,
	"wayback_latest_snapshot_at" timestamp with time zone,
	"wayback_earliest_snapshot_at" timestamp with time zone,
	"backlinks_total" bigint,
	"backlinks_referring_domains" integer,
	"backlinks_referring_main_domains" integer,
	"backlinks_referring_pages" bigint,
	"backlinks_broken" integer,
	"backlinks_spam_score" smallint,
	"backlinks_rank" smallint,
	"raw_payload_id" uuid,
	CONSTRAINT "competitor_activity_observations_pk" PRIMARY KEY("observed_at","competitor_id","source")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_activity_project_idx" ON "competitor_activity_observations" USING btree ("project_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_activity_competitor_idx" ON "competitor_activity_observations" USING btree ("competitor_id","observed_at");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'competitor_activity_observations',
			'observed_at',
			chunk_time_interval => INTERVAL '7 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		-- Issue #117 Sprint 2 acceptance: 90-day retention is enough for the
		-- weekly/monthly delta calculations the cockpit needs. Older chunks
		-- are dropped automatically.
		PERFORM add_retention_policy('competitor_activity_observations', INTERVAL '120 days', if_not_exists => TRUE);
	END IF;
END
$$;
