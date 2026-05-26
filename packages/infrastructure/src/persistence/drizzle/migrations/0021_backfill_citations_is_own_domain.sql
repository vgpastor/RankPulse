-- #169 backfill: recompute `llm_answers.citations[].isOwnDomain` for the
-- back-history that was written while RecordLlmAnswerUseCase flattened
-- BOTH own AND competitor domains into the "own" set. After the
-- use-case fix lands new rows are correct; this one-shot migration
-- repairs the older rows so dashboards stop reporting inflated
-- citationRate (the ES project was seeing 107% — silvertrac, tracktik,
-- qrpatrol were all being counted as own).
--
-- Source of truth for "own": `projects.primary_domain` UNION
-- `project_domains.domain`. Matching mirrors `Citation.fromUrl` —
-- lowercased exact match OR endsWith('.' + own). Citations whose
-- `domain` field can't be matched against any own domain become
-- isOwnDomain=false (the safe default; competitors fall here, as do
-- random third-party links).
--
-- Idempotent: re-running this against already-fixed rows recomputes
-- the same values.

WITH project_own_domains AS (
	SELECT
		p.id AS project_id,
		LOWER(REGEXP_REPLACE(d.domain, '^www\.', '')) AS domain
	FROM projects p
	LEFT JOIN project_domains pd ON pd.project_id = p.id
	CROSS JOIN LATERAL (
		VALUES (p.primary_domain), (pd.domain)
	) AS d(domain)
	WHERE d.domain IS NOT NULL AND length(trim(d.domain)) > 0
),
agg AS (
	SELECT project_id, array_agg(DISTINCT domain) AS own_domains
	FROM project_own_domains
	GROUP BY project_id
)
UPDATE llm_answers la
SET citations = COALESCE((
	SELECT jsonb_agg(
		(c - 'isOwnDomain') || jsonb_build_object(
			'isOwnDomain',
			EXISTS (
				SELECT 1 FROM unnest(a.own_domains) AS od
				WHERE LOWER(c->>'domain') = od
				   OR LOWER(c->>'domain') LIKE '%.' || od
			)
		)
	)
	FROM jsonb_array_elements(
		CASE WHEN jsonb_typeof(la.citations) = 'array' THEN la.citations ELSE '[]'::jsonb END
	) c
), '[]'::jsonb)
FROM agg a
WHERE la.project_id = a.project_id
  AND jsonb_typeof(la.citations) = 'array'
  AND jsonb_array_length(la.citations) > 0;
