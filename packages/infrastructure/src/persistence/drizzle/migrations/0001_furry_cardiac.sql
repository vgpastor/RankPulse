CREATE TABLE IF NOT EXISTS "api_usage_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"project_id" uuid,
	"provider_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"calls" integer NOT NULL,
	"cost_millicents" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"label" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"last_four" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_job_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"params_hash" text NOT NULL,
	"params" jsonb NOT NULL,
	"cron" text NOT NULL,
	"credential_override_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_job_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"credential_id" uuid,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"raw_payload_id" uuid,
	"error_json" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ranking_observations" (
	"observed_at" timestamp with time zone NOT NULL,
	"tracked_keyword_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"phrase" text NOT NULL,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"device" text NOT NULL,
	"position" smallint,
	"url" text,
	"serp_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_provider" text NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "ranking_observations_observed_at_tracked_keyword_id_pk" PRIMARY KEY("observed_at","tracked_keyword_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_payloads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_size" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracked_keywords" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"phrase" text NOT NULL,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"device" text NOT NULL,
	"search_engine" text NOT NULL,
	"paused_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_usage_entries" ADD CONSTRAINT "api_usage_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_usage_entries" ADD CONSTRAINT "api_usage_entries_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_usage_entries" ADD CONSTRAINT "api_usage_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_job_definitions" ADD CONSTRAINT "provider_job_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_job_definitions" ADD CONSTRAINT "provider_job_definitions_credential_override_id_provider_credentials_id_fk" FOREIGN KEY ("credential_override_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_job_runs" ADD CONSTRAINT "provider_job_runs_definition_id_provider_job_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."provider_job_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_job_runs" ADD CONSTRAINT "provider_job_runs_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_org_occurred_idx" ON "api_usage_entries" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_credential_idx" ON "api_usage_entries" USING btree ("credential_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_project_idx" ON "api_usage_entries" USING btree ("project_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_credentials_unique" ON "provider_credentials" USING btree ("organization_id","provider_id","scope_type","scope_id","label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credentials_org_provider_idx" ON "provider_credentials" USING btree ("organization_id","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_job_definitions_unique" ON "provider_job_definitions" USING btree ("project_id","provider_id","endpoint_id","params_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_job_definitions_project_idx" ON "provider_job_definitions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_job_runs_definition_idx" ON "provider_job_runs" USING btree ("definition_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ranking_observations_keyword_idx" ON "ranking_observations" USING btree ("tracked_keyword_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ranking_observations_project_idx" ON "ranking_observations" USING btree ("project_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "raw_payloads_request_hash_unique" ON "raw_payloads" USING btree ("request_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_payloads_provider_endpoint_idx" ON "raw_payloads" USING btree ("provider_id","endpoint_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracked_keywords_unique" ON "tracked_keywords" USING btree ("project_id","domain","phrase","country","language","device","search_engine");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracked_keywords_project_idx" ON "tracked_keywords" USING btree ("project_id");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'ranking_observations',
			'observed_at',
			chunk_time_interval => INTERVAL '7 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
	END IF;
END
$$;
