-- A project's own link authority, sampled from DataForSEO backlinks/summary.
--
-- Until now the only backlink data in the system described competitors. The
-- domains we actually try to rank had no authority record at all, which is
-- how nine satellites could sit with zero referring domains — sitemaps read
-- by Google and never crawled — without any report being able to say so.
--
-- One row per project per UTC day. The unique index is the idempotency key;
-- a same-day refetch replaces the earlier reading.

CREATE TABLE IF NOT EXISTS domain_authority_observations (
	id UUID PRIMARY KEY,
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	domain TEXT NOT NULL,
	observed_at TIMESTAMPTZ NOT NULL,
	backlinks_total BIGINT NOT NULL,
	referring_domains INTEGER NOT NULL,
	referring_main_domains INTEGER NOT NULL,
	referring_pages BIGINT NOT NULL,
	broken_backlinks INTEGER NOT NULL,
	spam_score SMALLINT,
	rank SMALLINT,
	raw_payload_id UUID
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS domain_authority_project_day_unique
	ON domain_authority_observations (project_id, observed_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS domain_authority_project_idx
	ON domain_authority_observations (project_id, observed_at);
