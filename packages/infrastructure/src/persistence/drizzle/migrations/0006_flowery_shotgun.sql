-- Issue #18 — PageSpeed Insights / Core Web Vitals tables. Idempotent
-- with IF NOT EXISTS + DO $$ EXCEPTION duplicate_object guards.

CREATE TABLE IF NOT EXISTS "tracked_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"strategy" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_speed_snapshots" (
	"tracked_page_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"lcp_ms" double precision,
	"inp_ms" double precision,
	"cls" double precision,
	"fcp_ms" double precision,
	"ttfb_ms" double precision,
	"performance_score" double precision,
	"seo_score" double precision,
	"accessibility_score" double precision,
	"best_practices_score" double precision,
	CONSTRAINT "page_speed_snapshots_tracked_page_id_observed_at_pk" PRIMARY KEY("tracked_page_id","observed_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracked_pages" ADD CONSTRAINT "tracked_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracked_pages" ADD CONSTRAINT "tracked_pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_speed_snapshots" ADD CONSTRAINT "page_speed_snapshots_tracked_page_id_tracked_pages_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracked_pages_project_url_strategy_unique" ON "tracked_pages" USING btree ("project_id","url","strategy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracked_pages_project_idx" ON "tracked_pages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_speed_snapshots_project_idx" ON "page_speed_snapshots" USING btree ("project_id","observed_at");
