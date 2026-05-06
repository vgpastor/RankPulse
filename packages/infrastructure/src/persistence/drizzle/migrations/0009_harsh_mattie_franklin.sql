-- Issue #25 — Cloudflare Radar (macro-context) tables. Idempotent with
-- IF NOT EXISTS + DO $$ EXCEPTION duplicate_object guards.

CREATE TABLE IF NOT EXISTS "monitored_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"credential_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radar_rank_snapshots" (
	"monitored_domain_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_date" text NOT NULL,
	"rank" integer,
	"bucket" text,
	"categories" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "radar_rank_snapshots_monitored_domain_id_observed_date_pk" PRIMARY KEY("monitored_domain_id","observed_date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitored_domains" ADD CONSTRAINT "monitored_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitored_domains" ADD CONSTRAINT "monitored_domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitored_domains" ADD CONSTRAINT "monitored_domains_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "radar_rank_snapshots" ADD CONSTRAINT "radar_rank_snapshots_monitored_domain_id_monitored_domains_id_fk" FOREIGN KEY ("monitored_domain_id") REFERENCES "public"."monitored_domains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitored_domains_project_domain_unique" ON "monitored_domains" USING btree ("project_id","domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitored_domains_project_idx" ON "monitored_domains" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "radar_rank_snapshots_project_idx" ON "radar_rank_snapshots" USING btree ("project_id","observed_date");
