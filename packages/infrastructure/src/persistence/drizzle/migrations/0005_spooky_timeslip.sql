-- Issue #33 — Wikipedia entity-awareness tables. Idempotent (IF NOT EXISTS)
-- so re-application after a partial restore doesn't error out.

CREATE TABLE IF NOT EXISTS "wikipedia_articles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"wikipedia_project" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wikipedia_pageviews" (
	"article_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"views" bigint NOT NULL,
	"access" text NOT NULL,
	"agent" text NOT NULL,
	"granularity" text NOT NULL,
	CONSTRAINT "wikipedia_pageviews_article_id_observed_at_pk" PRIMARY KEY("article_id","observed_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wikipedia_articles" ADD CONSTRAINT "wikipedia_articles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wikipedia_articles" ADD CONSTRAINT "wikipedia_articles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wikipedia_pageviews" ADD CONSTRAINT "wikipedia_pageviews_article_id_wikipedia_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."wikipedia_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wikipedia_articles_project_article_unique" ON "wikipedia_articles" USING btree ("project_id","wikipedia_project","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wikipedia_articles_project_idx" ON "wikipedia_articles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wikipedia_pageviews_project_idx" ON "wikipedia_pageviews" USING btree ("project_id","observed_at");
