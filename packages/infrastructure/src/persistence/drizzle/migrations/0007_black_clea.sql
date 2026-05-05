-- Issue #17 — GA4 Data API tables. Idempotent with IF NOT EXISTS +
-- DO $$ EXCEPTION duplicate_object guards (forward-only, safe to retry).

CREATE TABLE IF NOT EXISTS "ga4_properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"property_handle" text NOT NULL,
	"credential_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ga4_daily_metrics" (
	"ga4_property_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_date" text NOT NULL,
	"dimensions_hash" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "ga4_daily_metrics_ga4_property_id_observed_date_dimensions_hash_pk" PRIMARY KEY("ga4_property_id","observed_date","dimensions_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ga4_properties" ADD CONSTRAINT "ga4_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ga4_properties" ADD CONSTRAINT "ga4_properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ga4_properties" ADD CONSTRAINT "ga4_properties_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ga4_daily_metrics" ADD CONSTRAINT "ga4_daily_metrics_ga4_property_id_ga4_properties_id_fk" FOREIGN KEY ("ga4_property_id") REFERENCES "public"."ga4_properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ga4_properties_project_handle_unique" ON "ga4_properties" USING btree ("project_id","property_handle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ga4_properties_project_idx" ON "ga4_properties" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ga4_daily_metrics_project_idx" ON "ga4_daily_metrics" USING btree ("project_id","observed_date");
