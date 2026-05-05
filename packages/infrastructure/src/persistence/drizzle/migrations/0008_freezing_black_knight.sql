-- Issue #20 — Bing Webmaster Tools tables. Idempotent with IF NOT EXISTS +
-- DO $$ EXCEPTION duplicate_object guards (forward-only, safe to retry).

CREATE TABLE IF NOT EXISTS "bing_properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"credential_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bing_traffic_observations" (
	"bing_property_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_date" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"avg_click_position" double precision,
	"avg_impression_position" double precision,
	"raw_payload_id" uuid,
	CONSTRAINT "bing_traffic_observations_bing_property_id_observed_date_pk" PRIMARY KEY("bing_property_id","observed_date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bing_properties" ADD CONSTRAINT "bing_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bing_properties" ADD CONSTRAINT "bing_properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bing_properties" ADD CONSTRAINT "bing_properties_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bing_traffic_observations" ADD CONSTRAINT "bing_traffic_observations_bing_property_id_bing_properties_id_fk" FOREIGN KEY ("bing_property_id") REFERENCES "public"."bing_properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bing_properties_project_site_unique" ON "bing_properties" USING btree ("project_id","site_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bing_properties_project_idx" ON "bing_properties" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bing_traffic_observations_project_idx" ON "bing_traffic_observations" USING btree ("project_id","observed_date");
