-- A project is a set of domains, and the satellites this table exists for are
-- secondary domains of four projects. One reading per project per day would
-- have overwritten them with whichever domain ran last. Key by domain.

DROP INDEX IF EXISTS domain_authority_project_day_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS domain_authority_project_domain_day_unique
	ON domain_authority_observations (project_id, domain, observed_at);
