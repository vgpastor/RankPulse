CREATE TABLE IF NOT EXISTS "ranked_keywords_observations" (
	"observed_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"target_domain" text NOT NULL,
	"keyword" text NOT NULL,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"position" smallint,
	"search_volume" integer,
	"keyword_difficulty" smallint,
	"traffic_estimate" double precision,
	"cpc" double precision,
	"ranking_url" text,
	"source_provider" text NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "ranked_keywords_observations_pk" PRIMARY KEY("observed_at","project_id","target_domain","keyword","country","language")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ranked_keywords_observations_target_idx" ON "ranked_keywords_observations" USING btree ("target_domain","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ranked_keywords_observations_project_target_idx" ON "ranked_keywords_observations" USING btree ("project_id","target_domain","observed_at");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'ranked_keywords_observations',
			'observed_at',
			chunk_time_interval => INTERVAL '30 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		-- Issue #127 acceptance: 13-month rolling window covers a year of
		-- monthly snapshots plus a buffer so YoY trend deltas always have
		-- both endpoints available.
		PERFORM add_retention_policy(
			'ranked_keywords_observations',
			INTERVAL '13 months',
			if_not_exists => TRUE
		);
	END IF;
END
$$;
