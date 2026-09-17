-- Record whether a run served a cached payload instead of calling upstream.
--
-- Since the request-hash fix, several definitions that produce an identical
-- provider request share one fetch: the first run pays for it, the rest replay
-- the stored payload. All of them end `succeeded` with a `raw_payload_id`, so
-- the run table alone could not say which ones cost money.
--
-- Inferring it from `raw_payloads.fetched_at < provider_job_runs.started_at`
-- works but is fragile — it breaks on backfills and on any run that re-stores a
-- payload. Recording the decision where it is made keeps the ledger honest.
--
-- Defaults to false: rows written before this migration predate deduplication,
-- so every one of them was a real call.

ALTER TABLE provider_job_runs
	ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT FALSE;

--> statement-breakpoint
COMMENT ON COLUMN provider_job_runs.cache_hit IS
	'True when the run reused a payload fetched by an earlier run; no upstream call, no ApiUsageEntry.';

--> statement-breakpoint
-- Usage reporting filters succeeded runs by window and groups by this flag.
CREATE INDEX IF NOT EXISTS provider_job_runs_cache_hit_idx
	ON provider_job_runs (started_at, cache_hit)
	WHERE status = 'succeeded';
