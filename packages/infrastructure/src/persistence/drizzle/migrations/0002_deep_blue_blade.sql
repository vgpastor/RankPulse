CREATE TABLE IF NOT EXISTS "gsc_observations" (
	"observed_at" timestamp with time zone NOT NULL,
	"gsc_property_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"query" text,
	"page" text,
	"country" text,
	"device" text,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"ctr" double precision NOT NULL,
	"position" double precision NOT NULL,
	"raw_payload_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gsc_properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"property_type" text NOT NULL,
	"credential_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gsc_properties" ADD CONSTRAINT "gsc_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gsc_properties" ADD CONSTRAINT "gsc_properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gsc_properties" ADD CONSTRAINT "gsc_properties_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_observations_property_idx" ON "gsc_observations" USING btree ("gsc_property_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_observations_project_idx" ON "gsc_observations" USING btree ("project_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gsc_properties_project_site_unique" ON "gsc_properties" USING btree ("project_id","site_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_properties_project_idx" ON "gsc_properties" USING btree ("project_id");--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
		PERFORM create_hypertable(
			'gsc_observations',
			'observed_at',
			chunk_time_interval => INTERVAL '14 days',
			if_not_exists => TRUE,
			migrate_data => TRUE
		);
	END IF;
END
$$;
