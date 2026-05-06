-- Issue #43 — Microsoft Clarity (experience-analytics) tables. Idempotent
-- with IF NOT EXISTS + DO $$ EXCEPTION duplicate_object guards.

CREATE TABLE IF NOT EXISTS "clarity_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"clarity_handle" text NOT NULL,
	"credential_id" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clarity_daily_metrics" (
	"clarity_project_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_date" text NOT NULL,
	"sessions_count" bigint NOT NULL,
	"bot_sessions_count" bigint NOT NULL,
	"distinct_user_count" bigint NOT NULL,
	"pages_per_session" double precision NOT NULL,
	"rage_clicks" bigint NOT NULL,
	"dead_clicks" bigint NOT NULL,
	"avg_engagement_seconds" double precision NOT NULL,
	"avg_scroll_depth" double precision NOT NULL,
	"raw_payload_id" uuid,
	CONSTRAINT "clarity_daily_metrics_clarity_project_id_observed_date_pk" PRIMARY KEY("clarity_project_id","observed_date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clarity_projects" ADD CONSTRAINT "clarity_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clarity_projects" ADD CONSTRAINT "clarity_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clarity_projects" ADD CONSTRAINT "clarity_projects_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clarity_daily_metrics" ADD CONSTRAINT "clarity_daily_metrics_clarity_project_id_clarity_projects_id_fk" FOREIGN KEY ("clarity_project_id") REFERENCES "public"."clarity_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clarity_projects_project_handle_unique" ON "clarity_projects" USING btree ("project_id","clarity_handle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clarity_projects_project_idx" ON "clarity_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clarity_daily_metrics_project_idx" ON "clarity_daily_metrics" USING btree ("project_id","observed_date");
