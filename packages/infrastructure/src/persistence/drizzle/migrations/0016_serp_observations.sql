CREATE TABLE IF NOT EXISTS "serp_observations" (
	"observed_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"device" text NOT NULL,
	"rank" smallint NOT NULL,
	"domain" text NOT NULL,
	"url" text,
	"title" text,
	"source_provider" text NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "serp_observations_pk" PRIMARY KEY("observed_at","project_id","phrase","country","language","device","rank")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serp_observations_project_idx" ON "serp_observations" USING btree ("project_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serp_observations_project_keyword_idx" ON "serp_observations" USING btree ("project_id","phrase","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serp_observations_project_domain_idx" ON "serp_observations" USING btree ("project_id","domain","observed_at");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'serp_observations',
			'observed_at',
			chunk_time_interval => INTERVAL '7 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		-- Issue #115 acceptance: a 7-day rolling window is plenty for the
		-- SERP-map UI and competitor-suggestion read model. Older chunks
		-- are dropped automatically so the table stays bounded
		-- (~30 keywords × 30 results × 7 days ≈ 6.3k rows per project).
		PERFORM add_retention_policy('serp_observations', INTERVAL '14 days', if_not_exists => TRUE);
	END IF;
END
$$;
