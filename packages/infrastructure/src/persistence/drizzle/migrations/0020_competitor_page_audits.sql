CREATE TABLE IF NOT EXISTS "competitor_page_audits" (
	"observed_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"competitor_domain" text NOT NULL,
	"url" text NOT NULL,
	"status_code" smallint,
	"status_message" text,
	"fetch_time_ms" integer,
	"page_size_bytes" integer,
	"title" text,
	"meta_description" text,
	"h1" text,
	"h2_count" smallint,
	"h3_count" smallint,
	"word_count" integer,
	"plain_text_size_bytes" integer,
	"internal_links_count" integer,
	"external_links_count" integer,
	"has_schema_org" boolean,
	"schema_types" jsonb,
	"canonical_url" text,
	"redirect_url" text,
	"lcp_ms" integer,
	"cls" double precision,
	"ttfb_ms" integer,
	"dom_size" integer,
	"is_amp" boolean,
	"is_javascript" boolean,
	"is_https" boolean,
	"hreflang_count" smallint,
	"og_tags_count" smallint,
	"source_provider" text NOT NULL,
	"raw_payload_id" uuid,
	"observed_at_provider" timestamp with time zone,
	CONSTRAINT "competitor_page_audits_pk" PRIMARY KEY("observed_at","project_id","competitor_domain","url")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "competitor_page_audits"
		ADD CONSTRAINT "competitor_page_audits_project_id_fk"
		FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_page_audits_pair_idx" ON "competitor_page_audits" USING btree ("project_id","competitor_domain","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_page_audits_domain_idx" ON "competitor_page_audits" USING btree ("competitor_domain","observed_at");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'competitor_page_audits',
			'observed_at',
			chunk_time_interval => INTERVAL '30 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		-- Issue #131 acceptance: 13-month rolling window matches the rest of
		-- the competitor-intelligence BC (#128) and rank-tracking (#127), so
		-- YoY trend deltas always have both endpoints available.
		PERFORM add_retention_policy(
			'competitor_page_audits',
			INTERVAL '13 months',
			if_not_exists => TRUE
		);
	END IF;
END
$$;
