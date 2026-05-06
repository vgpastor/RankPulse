CREATE TABLE IF NOT EXISTS "brand_prompts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"kind" text NOT NULL,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_answers" (
	"captured_at" timestamp with time zone NOT NULL,
	"id" uuid NOT NULL,
	"brand_prompt_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"ai_provider" text NOT NULL,
	"model" text NOT NULL,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"raw_text" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"web_search_calls" integer DEFAULT 0 NOT NULL,
	"cost_millicents" bigint DEFAULT 0 NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "llm_answers_captured_at_id_pk" PRIMARY KEY("captured_at","id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_prompts" ADD CONSTRAINT "brand_prompts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_prompts" ADD CONSTRAINT "brand_prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_prompts_project_text_unique" ON "brand_prompts" USING btree ("project_id","text");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_prompts_project_idx" ON "brand_prompts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_answers_prompt_idx" ON "llm_answers" USING btree ("brand_prompt_id","captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_answers_project_idx" ON "llm_answers" USING btree ("project_id","captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_answers_provider_locale_idx" ON "llm_answers" USING btree ("project_id","ai_provider","country","language","captured_at");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'llm_answers',
			'captured_at',
			chunk_time_interval => INTERVAL '7 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
		-- Compress chunks older than 7 days. Mentions/citations/raw_text are
		-- the bulk of the row; columnstore compression collapses them ~10x
		-- in production-grade datasets.
		PERFORM add_compression_policy('llm_answers', INTERVAL '7 days', if_not_exists => TRUE);
	END IF;
END
$$;
