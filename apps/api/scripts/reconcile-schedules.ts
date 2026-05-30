/**
 * Reconcile BullMQ Job Schedulers with the ENABLED JobDefinitions in the DB.
 *
 * Background (#194): until the Job Scheduler migration, `BullMqJobScheduler`
 * registered repeatables WITHOUT a per-definition id, so every definition that
 * shared a provider + cron collapsed onto ONE BullMQ repeatable. Verified in
 * production: 15 GSC defs on "0 5 * * *" => a single repeatable, so only one
 * definition ran per day and the rest (EN/FR/MX patroltech.online + every
 * satellite domain) silently froze. The same collapse hit every provider
 * (dataforseo, anthropic, openai, ...).
 *
 * The code fix keys each scheduler by `definition.id`, but the already-collapsed
 * Redis state does not self-heal — there is no boot-time reconciliation. This
 * script rebuilds the schedulers from the DB (the source of truth):
 *
 *   1. Re-register every ENABLED definition (idempotent upsert, one scheduler
 *      per `definition.id`). This never removes a valid schedule, so there is no
 *      window where an enabled definition is left unscheduled.
 *   2. Drop any remaining scheduler whose key is NOT a current enabled
 *      definition id — i.e. the legacy collapsed/auto-keyed repeatables and any
 *      stale (disabled/deleted) leftovers.
 *
 * Idempotent and safe to run on every deploy.
 *
 * Usage from repo root:
 *   pnpm --filter @rankpulse/api reconcile:schedules [--dry-run]
 *
 * Requires DATABASE_URL and REDIS_URL in env (loaded via the api package's
 * standard `--env-file-if-exists` chain — see package.json scripts).
 */
import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { DrizzlePersistence, Queue as QueueAdapters } from '@rankpulse/infrastructure';

interface DefinitionRow {
	id: string;
	project_id: string;
	provider_id: string;
	endpoint_id: string;
	params: Record<string, unknown> | null;
	cron: string;
	credential_override_id: string | null;
	enabled: boolean;
	last_run_at: Date | null;
	created_at: Date;
}

function toDefinition(row: DefinitionRow): ProviderConnectivity.ProviderJobDefinition {
	return ProviderConnectivity.ProviderJobDefinition.rehydrate({
		id: row.id as ProviderConnectivity.ProviderJobDefinitionId,
		projectId: row.project_id as ProjectManagement.ProjectId,
		providerId: ProviderConnectivity.ProviderId.create(row.provider_id),
		endpointId: ProviderConnectivity.EndpointId.create(row.endpoint_id),
		params: row.params ?? {},
		cron: ProviderConnectivity.CronExpression.create(row.cron),
		credentialOverrideId:
			(row.credential_override_id as ProviderConnectivity.ProviderCredentialId | null) ?? null,
		enabled: row.enabled,
		lastRunAt: row.last_run_at,
		createdAt: row.created_at,
	});
}

async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');
	const connectionString = process.env.DATABASE_URL;
	const redisUrl = process.env.REDIS_URL;
	if (!connectionString) {
		console.error('DATABASE_URL is not set');
		process.exit(1);
	}
	if (!redisUrl) {
		console.error('REDIS_URL is not set');
		process.exit(1);
	}

	const client = DrizzlePersistence.createDrizzleClient({ connectionString });
	const sql = client.sql;
	const scheduler = new QueueAdapters.BullMqJobScheduler({ connection: { url: redisUrl } });

	const report = {
		enabledRegistered: 0,
		providersScanned: 0,
		staleSchedulersRemoved: 0,
	};

	console.log(`[reconcile-schedules] mode=${dryRun ? 'DRY RUN' : 'EXECUTE'}`);

	try {
		const enabledRows = await sql<DefinitionRow[]>`
			SELECT id, project_id, provider_id, endpoint_id, params, cron,
			       credential_override_id, enabled, last_run_at, created_at
			FROM provider_job_definitions
			WHERE enabled = true
		`;

		// Enabled definition ids grouped by provider — used both to register and
		// to recognise which schedulers are legitimate during cleanup.
		const enabledIdsByProvider = new Map<string, Set<string>>();
		for (const row of enabledRows) {
			const set = enabledIdsByProvider.get(row.provider_id) ?? new Set<string>();
			set.add(row.id);
			enabledIdsByProvider.set(row.provider_id, set);
		}

		// 1) Register every enabled definition (idempotent, never leaves a gap).
		for (const row of enabledRows) {
			console.log(`[reconcile] register def=${row.id} provider=${row.provider_id} cron='${row.cron}'`);
			if (!dryRun) await scheduler.register(toDefinition(row));
			report.enabledRegistered += 1;
		}

		// 2) Drop legacy/stale schedulers (key is not a current enabled def id).
		const providerRows = await sql<{ provider_id: string }[]>`
			SELECT DISTINCT provider_id FROM provider_job_definitions
		`;
		for (const { provider_id: providerId } of providerRows) {
			report.providersScanned += 1;
			const queue = scheduler.getQueue(providerId);
			const valid = enabledIdsByProvider.get(providerId) ?? new Set<string>();
			const existing = await queue.getJobSchedulers(0, -1);
			for (const s of existing) {
				if (valid.has(s.key)) continue;
				console.log(`[reconcile] remove stale scheduler key=${s.key} provider=${providerId}`);
				if (!dryRun) await queue.removeJobScheduler(s.key);
				report.staleSchedulersRemoved += 1;
			}
		}

		console.log('\n=== RECONCILE REPORT ===');
		console.log(JSON.stringify(report, null, 2));
		if (dryRun) console.log('(DRY RUN — no changes written)');
	} finally {
		await scheduler.close();
		await client.close();
	}
}

main().catch((err) => {
	console.error('reconcile-schedules failed:', err);
	process.exit(1);
});
