/**
 * Reconcile entity-bound JobDefinitions with their owning entity row.
 *
 * Background — ADR 0001 (`docs/adr/0001-eliminate-systemparamresolver-via-auto-schedule-handlers.md`):
 * the seven entity-bound endpoints (gsc, ga4, wikipedia, bing, clarity, psi,
 * radar) used to be schedulable manually via `POST /providers/.../schedule`.
 * If the caller forgot to inject the systemParam (`gscPropertyId`, etc.),
 * the worker silently dropped every payload (`<endpoint> missing <X>Id;
 * skipping ingest`). PRs #53/#55 plastered over it with a resolver
 * pattern; ADR 0001 retired the resolver in favour of per-context
 * Auto-Schedule handlers triggered by `<entity>Linked` events.
 *
 * This script repairs JobDefinitions that pre-date the fix:
 *
 *   - If params already has the systemParam, leave it alone.
 *   - Otherwise, look up the entity by the user-facing identifier in
 *     params (siteUrl, propertyHandle, etc.). If found, PATCH the
 *     JobDefinition with the resolved `<entity>Id`.
 *   - If the entity does not exist for this project, DELETE the
 *     JobDefinition (no automatic recovery is possible — operator must
 *     re-link the entity, which auto-creates a fresh definition).
 *
 * Clarity is special: the descriptor has no project-id user param (the
 * Bearer token scopes the project), so a JobDefinition with a missing
 * `clarityProjectId` cannot be back-resolved at all. Those rows are
 * always DELETEd in repair mode.
 *
 * Usage from repo root:
 *
 *   pnpm --filter @rankpulse/api repair:job-definitions [--dry-run]
 *
 * Requires `DATABASE_URL` in env (loaded via the api package's standard
 * `--env-file-if-exists=../../.env` chain — see package.json scripts).
 */
import { DrizzlePersistence } from '@rankpulse/infrastructure';

type Sql = DrizzlePersistence.DrizzleClient['sql'];

interface RepairConfig {
	endpointId: string;
	systemKey: string;
	/** Resolves the entity id from row.params for a given projectId. Returns the entity id (uuid string) or null when no match. */
	resolveEntityId(sql: Sql, projectId: string, params: Record<string, unknown>): Promise<string | null>;
}

const ENTITY_BOUND: RepairConfig[] = [
	{
		endpointId: 'gsc-search-analytics',
		systemKey: 'gscPropertyId',
		async resolveEntityId(sql, projectId, params) {
			const siteUrl = params.siteUrl;
			if (typeof siteUrl !== 'string') return null;
			const rows = await sql<{ id: string }[]>`
				SELECT id FROM gsc_properties
				WHERE project_id = ${projectId} AND site_url = ${siteUrl} AND unlinked_at IS NULL
				LIMIT 1
			`;
			return rows[0]?.id ?? null;
		},
	},
	{
		endpointId: 'ga4-run-report',
		systemKey: 'ga4PropertyId',
		async resolveEntityId(sql, projectId, params) {
			const propertyId = params.propertyId;
			if (typeof propertyId !== 'string') return null;
			const rows = await sql<{ id: string }[]>`
				SELECT id FROM ga4_properties
				WHERE project_id = ${projectId} AND property_handle = ${propertyId} AND unlinked_at IS NULL
				LIMIT 1
			`;
			return rows[0]?.id ?? null;
		},
	},
	{
		endpointId: 'psi-runpagespeed',
		systemKey: 'trackedPageId',
		async resolveEntityId(sql, projectId, params) {
			const url = params.url;
			const strategy = params.strategy;
			if (typeof url !== 'string' || typeof strategy !== 'string') return null;
			const rows = await sql<{ id: string }[]>`
				SELECT id FROM tracked_pages
				WHERE project_id = ${projectId} AND url = ${url} AND strategy = ${strategy}
				LIMIT 1
			`;
			return rows[0]?.id ?? null;
		},
	},
	{
		endpointId: 'wikipedia-pageviews-per-article',
		systemKey: 'wikipediaArticleId',
		async resolveEntityId(sql, projectId, params) {
			const wikipediaProject = params.project;
			const slug = params.article;
			if (typeof wikipediaProject !== 'string' || typeof slug !== 'string') return null;
			const rows = await sql<{ id: string }[]>`
				SELECT id FROM wikipedia_articles
				WHERE project_id = ${projectId}
				  AND wikipedia_project = ${wikipediaProject}
				  AND slug = ${slug}
				  AND unlinked_at IS NULL
				LIMIT 1
			`;
			return rows[0]?.id ?? null;
		},
	},
	{
		endpointId: 'bing-rank-and-traffic-stats',
		systemKey: 'bingPropertyId',
		async resolveEntityId(sql, projectId, params) {
			const siteUrl = params.siteUrl;
			if (typeof siteUrl !== 'string') return null;
			const rows = await sql<{ id: string }[]>`
				SELECT id FROM bing_properties
				WHERE project_id = ${projectId} AND site_url = ${siteUrl} AND unlinked_at IS NULL
				LIMIT 1
			`;
			return rows[0]?.id ?? null;
		},
	},
	{
		endpointId: 'clarity-data-export',
		systemKey: 'clarityProjectId',
		async resolveEntityId() {
			// Clarity's descriptor has no project-id user param (Bearer-scoped),
			// so we cannot back-resolve. Return null → DELETE the broken row.
			return null;
		},
	},
	{
		endpointId: 'radar-domain-rank',
		systemKey: 'monitoredDomainId',
		async resolveEntityId(sql, projectId, params) {
			const domain = params.domain;
			if (typeof domain !== 'string') return null;
			const rows = await sql<{ id: string }[]>`
				SELECT id FROM monitored_domains
				WHERE project_id = ${projectId} AND domain = ${domain} AND removed_at IS NULL
				LIMIT 1
			`;
			return rows[0]?.id ?? null;
		},
	},
];

interface RepairReport {
	scanned: number;
	alreadyOk: number;
	patched: number;
	deletedNoEntity: number;
	errors: Array<{ definitionId: string; endpointId: string; reason: string }>;
}

async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('DATABASE_URL is not set');
		process.exit(1);
	}

	const client = DrizzlePersistence.createDrizzleClient({ connectionString });
	const sql = client.sql;
	const report: RepairReport = {
		scanned: 0,
		alreadyOk: 0,
		patched: 0,
		deletedNoEntity: 0,
		errors: [],
	};

	console.log(`[repair] mode=${dryRun ? 'DRY RUN' : 'EXECUTE'}`);

	try {
		for (const cfg of ENTITY_BOUND) {
			const rows = await sql<{ id: string; project_id: string; params: Record<string, unknown> }[]>`
				SELECT id, project_id, params
				FROM provider_job_definitions
				WHERE endpoint_id = ${cfg.endpointId}
			`;

			for (const row of rows) {
				report.scanned += 1;
				const params = row.params ?? {};
				if (params[cfg.systemKey]) {
					report.alreadyOk += 1;
					continue;
				}

				let entityId: string | null = null;
				try {
					entityId = await cfg.resolveEntityId(sql, row.project_id, params);
				} catch (err) {
					report.errors.push({
						definitionId: row.id,
						endpointId: cfg.endpointId,
						reason: `resolver threw: ${err instanceof Error ? err.message : String(err)}`,
					});
					continue;
				}

				if (entityId) {
					console.log(
						`[repair] ${cfg.endpointId}: PATCH definition ${row.id} with ${cfg.systemKey}=${entityId}`,
					);
					if (!dryRun) {
						await sql`
							UPDATE provider_job_definitions
							SET params = jsonb_set(params, ${`{${cfg.systemKey}}`}, to_jsonb(${entityId}::text), true)
							WHERE id = ${row.id}
						`;
					}
					report.patched += 1;
				} else {
					console.log(
						`[repair] ${cfg.endpointId}: DELETE definition ${row.id} (no matching entity for params)`,
					);
					if (!dryRun) {
						await sql`DELETE FROM provider_job_definitions WHERE id = ${row.id}`;
					}
					report.deletedNoEntity += 1;
				}
			}
		}

		console.log('\n=== REPAIR REPORT ===');
		console.log(JSON.stringify(report, null, 2));
		if (dryRun) console.log('(DRY RUN — no changes written)');
	} finally {
		await client.close();
	}
}

main().catch((err) => {
	console.error('repair-job-definitions failed:', err);
	process.exit(1);
});
