-- Snapshot reconciliation. Migrations 0013 and 0014 were authored by hand
-- (TimescaleDB-aware DDL that drizzle-kit cannot emit), so the per-migration
-- snapshots `meta/0013_snapshot.json` and `meta/0014_snapshot.json` never
-- landed and the model drifted from reality.
--
-- This migration regenerates the snapshot in `meta/0015_snapshot.json` so
-- subsequent `drizzle-kit generate` runs are clean. The DDL below is wrapped
-- in `IF NOT EXISTS` and `EXCEPTION duplicate_object` guards so applying it
-- on a database that already ran 0013 (which created these objects) is a
-- no-op, while a fresh database picks up the same definitions verbatim.

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
CREATE INDEX IF NOT EXISTS "llm_answers_provider_locale_idx" ON "llm_answers" USING btree ("project_id","ai_provider","country","language","captured_at");
