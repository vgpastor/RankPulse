-- Retroactively repairs deployments where the original 0013 was marked
-- applied without the compression policy actually attaching. The first
-- shipped version of 0013 attempted `add_compression_policy` on
-- `llm_answers` without first enabling columnstore on the hypertable;
-- TimescaleDB rejected it with:
--   ERROR: columnstore not enabled on hypertable "llm_answers"
-- Production was patched manually (rows inserted into
-- `__drizzle_migrations` to skip the failing 0013) which left the
-- table without columnstore + compression policy. drizzle-kit's
-- migrator decides what to apply by `created_at` only and never
-- replays a migration whose content changed, so editing 0013 alone
-- cannot heal those deployments — this follow-up does.
--
-- Idempotent on every front:
--   - guarded by `pg_extension` so installs without TimescaleDB no-op,
--   - skips the ALTER when columnstore is already enabled (e.g. fresh
--     installs that ran the corrected 0013),
--   - `add_compression_policy(..., if_not_exists => TRUE)` is a no-op
--     when the policy already exists.

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')
	   AND EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'llm_answers') THEN
		IF NOT COALESCE(
			(SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'llm_answers'),
			false
		) THEN
			ALTER TABLE llm_answers SET (
				timescaledb.compress = true,
				timescaledb.compress_segmentby = 'project_id, ai_provider',
				timescaledb.compress_orderby = 'captured_at DESC, id'
			);
		END IF;
		PERFORM add_compression_policy('llm_answers', INTERVAL '7 days', if_not_exists => TRUE);
	END IF;
END
$$;
