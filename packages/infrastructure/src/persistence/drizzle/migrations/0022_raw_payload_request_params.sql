-- Persist the params each raw payload was fetched with.
--
-- `raw_payloads` stored `request_hash` but not its inputs, so an operator
-- reading a payload back could see the response and an opaque hash, with no
-- way to tell what was actually asked. That matters for auditing spend and for
-- reproducing an incident: "this SERP looks wrong" is only answerable if you
-- can see the keyword, location, language and device behind it.
--
-- Nullable on purpose: rows written before this migration keep their hash but
-- their params are unrecoverable. Backfilling is impossible — the hash is
-- one-way — so readers treat NULL as "written before 0022".

ALTER TABLE raw_payloads
	ADD COLUMN IF NOT EXISTS request_params JSONB;

--> statement-breakpoint
COMMENT ON COLUMN raw_payloads.request_params IS
	'Params the request was built from (the same subset hashed into request_hash). NULL for rows predating migration 0022.';
