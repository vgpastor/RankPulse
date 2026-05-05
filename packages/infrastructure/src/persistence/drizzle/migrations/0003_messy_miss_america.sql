CREATE TABLE "competitor_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"keywords_in_top10" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_top10_hits" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"promoted_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "competitor_suggestions" ADD CONSTRAINT "competitor_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_suggestions_project_domain_unique" ON "competitor_suggestions" USING btree ("project_id","domain");--> statement-breakpoint
CREATE INDEX "competitor_suggestions_project_status_idx" ON "competitor_suggestions" USING btree ("project_id","status");