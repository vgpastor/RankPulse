-- Issue #45 — Meta (Facebook + Instagram) ads-attribution tables.
-- Idempotent with IF NOT EXISTS + DO $$ EXCEPTION duplicate_object guards.

CREATE TABLE IF NOT EXISTS "meta_pixels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"pixel_handle" text NOT NULL,
	"credential_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ad_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"ad_account_handle" text NOT NULL,
	"credential_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_pixel_events_daily" (
	"meta_pixel_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_date" text NOT NULL,
	"event_name" text NOT NULL,
	"event_count" integer NOT NULL,
	"value_sum" double precision NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "meta_pixel_events_daily_meta_pixel_id_observed_date_event_name_pk" PRIMARY KEY("meta_pixel_id","observed_date","event_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ads_insights_daily" (
	"meta_ad_account_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_date" text NOT NULL,
	"level" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text DEFAULT '' NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend" double precision NOT NULL,
	"conversions" integer NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "meta_ads_insights_daily_meta_ad_account_id_observed_date_level_entity_id_pk" PRIMARY KEY("meta_ad_account_id","observed_date","level","entity_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_pixels" ADD CONSTRAINT "meta_pixels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_pixels" ADD CONSTRAINT "meta_pixels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_pixels" ADD CONSTRAINT "meta_pixels_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_pixel_events_daily" ADD CONSTRAINT "meta_pixel_events_daily_meta_pixel_id_meta_pixels_id_fk" FOREIGN KEY ("meta_pixel_id") REFERENCES "public"."meta_pixels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_ads_insights_daily" ADD CONSTRAINT "meta_ads_insights_daily_meta_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("meta_ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_pixels_project_handle_unique" ON "meta_pixels" USING btree ("project_id","pixel_handle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_pixels_project_idx" ON "meta_pixels" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_ad_accounts_project_handle_unique" ON "meta_ad_accounts" USING btree ("project_id","ad_account_handle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_accounts_project_idx" ON "meta_ad_accounts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_pixel_events_daily_project_idx" ON "meta_pixel_events_daily" USING btree ("project_id","observed_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ads_insights_daily_project_idx" ON "meta_ads_insights_daily" USING btree ("project_id","observed_date");
