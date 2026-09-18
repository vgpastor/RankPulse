-- provider_job_runs.raw_payload_id never had a foreign key, and the payload
-- repository swallowed unique-hash conflicts without returning the surviving
-- id. Two runs fetching the same request concurrently therefore left the
-- second one pointing at a payload id that was never written: 337 such runs
-- between 2026-05-06 and 2026-09-18.
--
-- Those references never resolved to anything, so there is nothing to
-- recover; NULL is the honest value. The constraint then keeps it from
-- happening again, and lets a payload be deleted without stranding its runs.

UPDATE provider_job_runs r
   SET raw_payload_id = NULL
 WHERE raw_payload_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM raw_payloads p WHERE p.id = r.raw_payload_id);
--> statement-breakpoint
ALTER TABLE provider_job_runs
	ADD CONSTRAINT provider_job_runs_raw_payload_id_raw_payloads_id_fk
	FOREIGN KEY (raw_payload_id) REFERENCES raw_payloads(id) ON DELETE SET NULL;
