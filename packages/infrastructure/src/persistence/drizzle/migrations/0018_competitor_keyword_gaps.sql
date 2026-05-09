CREATE TABLE IF NOT EXISTS "competitor_keyword_gaps" (
	"observed_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"our_domain" text NOT NULL,
	"competitor_domain" text NOT NULL,
	"keyword" text NOT NULL,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"our_position" smallint,
	"their_position" smallint,
	"search_volume" integer,
	"cpc" double precision,
	"keyword_difficulty" smallint,
	"source_provider" text NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "competitor_keyword_gaps_pk" PRIMARY KEY("observed_at","project_id","our_domain","competitor_domain","keyword","country","language")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "competitor_keyword_gaps"
		ADD CONSTRAINT "competitor_keyword_gaps_project_id_fk"
		FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_keyword_gaps_pair_idx" ON "competitor_keyword_gaps" USING btree ("project_id","our_domain","competitor_domain","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_keyword_gaps_competitor_idx" ON "competitor_keyword_gaps" USING btree ("competitor_domain","observed_at");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'competitor_keyword_gaps',
			'observed_at',
			chunk_time_interval => INTERVAL '30 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		-- Issue #128 acceptance: 13-month rolling window covers a year of
		-- monthly snapshots plus a buffer so YoY trend deltas always have
		-- both endpoints available (matches #127's retention).
		PERFORM add_retention_policy(
			'competitor_keyword_gaps',
			INTERVAL '13 months',
			if_not_exists => TRUE
		);
	END IF;
END
$$;
