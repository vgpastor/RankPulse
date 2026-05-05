import {
	EntityAwareness as EntityAwarenessUseCases,
	ProjectManagement as ProjectManagementUseCases,
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
	SearchConsoleInsights as SearchConsoleInsightsUseCases,
	WebPerformance as WebPerformanceUseCases,
} from '@rankpulse/application';
import { Crypto, DrizzlePersistence, Events, Queue as QueueAdapters } from '@rankpulse/infrastructure';
import { SystemClock, SystemIdGenerator } from '@rankpulse/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pino } from 'pino';
import { loadEnv } from './config/env.js';
import { createHealthServer } from './health-server.js';
import { ProviderFetchProcessor } from './processors/provider-fetch.processor.js';
import { buildProviderRegistry } from './providers/registry.js';

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });

	const drizzle = DrizzlePersistence.createDrizzleClient({ connectionString: env.DATABASE_URL });
	const credentialRepo = new DrizzlePersistence.DrizzleCredentialRepository(drizzle.db);
	const jobDefRepo = new DrizzlePersistence.DrizzleJobDefinitionRepository(drizzle.db);
	const jobRunRepo = new DrizzlePersistence.DrizzleJobRunRepository(drizzle.db);
	const rawPayloadRepo = new DrizzlePersistence.DrizzleRawPayloadRepository(drizzle.db);
	const apiUsageRepo = new DrizzlePersistence.DrizzleApiUsageRepository(drizzle.db);
	const trackedKeywordRepo = new DrizzlePersistence.DrizzleTrackedKeywordRepository(drizzle.db);
	const observationRepo = new DrizzlePersistence.DrizzleRankingObservationRepository(drizzle.db);
	const competitorRepo = new DrizzlePersistence.DrizzleCompetitorRepository(drizzle.db);
	const competitorSuggestionRepo = new DrizzlePersistence.DrizzleCompetitorSuggestionRepository(drizzle.db);
	const gscPropertyRepo = new DrizzlePersistence.DrizzleGscPropertyRepository(drizzle.db);
	const gscObservationRepo = new DrizzlePersistence.DrizzleGscPerformanceObservationRepository(drizzle.db);
	const wikipediaArticleRepo = new DrizzlePersistence.DrizzleWikipediaArticleRepository(drizzle.db);
	const wikipediaPageviewRepo = new DrizzlePersistence.DrizzleWikipediaPageviewObservationRepository(
		drizzle.db,
	);
	const trackedPageRepo = new DrizzlePersistence.DrizzleTrackedPageRepository(drizzle.db);
	const pageSpeedSnapshotRepo = new DrizzlePersistence.DrizzlePageSpeedSnapshotRepository(drizzle.db);

	const vault = new Crypto.LibsodiumCredentialVault(env.RANKPULSE_MASTER_KEY);
	const eventPublisher = new Events.InMemoryEventPublisher();

	const registry = buildProviderRegistry({ dataforseoBaseUrl: env.DATAFORSEO_API_BASE_URL });

	const resolveCredentialUseCase = new ProviderConnectivityUseCases.ResolveProviderCredentialUseCase(
		credentialRepo,
		vault,
		SystemClock,
	);
	const recordApiUsageUseCase = new ProviderConnectivityUseCases.RecordApiUsageUseCase(
		apiUsageRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const recordRankingObservationUseCase = new RankTrackingUseCases.RecordRankingObservationUseCase(
		trackedKeywordRepo,
		observationRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const ingestGscRowsUseCase = new SearchConsoleInsightsUseCases.IngestGscRowsUseCase(
		gscPropertyRepo,
		gscObservationRepo,
		SystemIdGenerator,
		eventPublisher,
		SystemClock,
	);
	const recordTop10HitsForSuggestionsUseCase =
		new ProjectManagementUseCases.RecordTop10HitsForSuggestionsUseCase(
			competitorSuggestionRepo,
			SystemClock,
			SystemIdGenerator,
			{ warn: (meta, msg) => logger.warn(meta, msg) },
		);
	const ingestWikipediaPageviewsUseCase = new EntityAwarenessUseCases.IngestWikipediaPageviewsUseCase(
		wikipediaArticleRepo,
		wikipediaPageviewRepo,
		eventPublisher,
		SystemClock,
	);
	const recordPageSpeedSnapshotUseCase = new WebPerformanceUseCases.RecordPageSpeedSnapshotUseCase(
		trackedPageRepo,
		pageSpeedSnapshotRepo,
		eventPublisher,
	);

	const processor = new ProviderFetchProcessor({
		registry,
		credentialRepo,
		jobDefRepo,
		jobRunRepo,
		rawPayloadRepo,
		apiUsageRepo,
		trackedKeywordRepo,
		competitorRepo,
		gscPropertyRepo,
		wikipediaArticleRepo,
		trackedPageRepo,
		vault,
		resolveCredentialUseCase,
		recordApiUsageUseCase,
		recordRankingObservationUseCase,
		recordTop10HitsForSuggestionsUseCase,
		ingestGscRowsUseCase,
		ingestWikipediaPageviewsUseCase,
		recordPageSpeedSnapshotUseCase,
		clock: SystemClock,
		ids: SystemIdGenerator,
		logger,
	});

	const connection = new IORedis(env.REDIS_URL, {
		maxRetriesPerRequest: null,
		enableReadyCheck: false,
	});

	const workers: Worker[] = [];
	for (const provider of registry.list()) {
		const queueName = QueueAdapters.providerQueueName(provider.id.value);
		const worker = new Worker(
			queueName,
			async (job) => {
				logger.info({ queue: queueName, jobId: job.id }, 'processing fetch job');
				await processor.handle(job.data);
			},
			{
				connection,
				concurrency: env.WORKER_CONCURRENCY,
			},
		);
		worker.on('failed', (job, err) => {
			logger.error({ queue: queueName, jobId: job?.id, err: err.message }, 'fetch job failed');
		});
		// BullMQ marks a job stalled when its lock expires (process killed
		// mid-handler, GC pause, etc.). Without this listener the run row
		// in DB stays in `running` forever — surfaces as a never-finishing
		// fetch in the UI. Logged loudly so the operator knows the run
		// needs reconciliation; the actual DB cleanup belongs to a
		// dedicated maintenance task (out of scope here, tracked).
		worker.on('stalled', (jobId) => {
			logger.warn(
				{ queue: queueName, jobId },
				'fetch job stalled — lock expired, BullMQ will requeue. Associated run row may need manual reconciliation if the worker died mid-handler',
			);
		});
		workers.push(worker);
		logger.info({ queue: queueName }, 'worker started');
	}

	const healthServer = createHealthServer({
		pingPostgres: async () => {
			// `postgres` (postgres-js) supports tagged-template SQL directly. The
			// drizzle client exposes the underlying `sql` instance for exactly this
			// kind of out-of-ORM use.
			await drizzle.sql`SELECT 1`;
		},
		pingRedis: async () => {
			const pong = await connection.ping();
			if (pong !== 'PONG') throw new Error(`unexpected redis reply: ${pong}`);
		},
		workers,
		logger,
	});
	await healthServer.listen(env.HEALTH_PORT, env.HEALTH_HOST);

	const shutdown = async (): Promise<void> => {
		logger.info('shutting down worker…');
		await healthServer.close();
		await Promise.all(workers.map((w) => w.close()));
		await connection.quit();
		await drizzle.close();
		process.exit(0);
	};
	process.once('SIGTERM', () => void shutdown());
	process.once('SIGINT', () => void shutdown());
}

bootstrap().catch((err) => {
	// eslint-disable-next-line no-console
	console.error('Fatal: failed to start worker', err);
	process.exit(1);
});
