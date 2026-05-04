import {
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
} from '@rankpulse/application';
import { Crypto, DrizzlePersistence, Events, Queue as QueueAdapters } from '@rankpulse/infrastructure';
import { SystemClock, SystemIdGenerator } from '@rankpulse/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pino } from 'pino';
import { loadEnv } from './config/env.js';
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

	const processor = new ProviderFetchProcessor({
		registry,
		credentialRepo,
		jobDefRepo,
		jobRunRepo,
		rawPayloadRepo,
		apiUsageRepo,
		trackedKeywordRepo,
		vault,
		resolveCredentialUseCase,
		recordApiUsageUseCase,
		recordRankingObservationUseCase,
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
		workers.push(worker);
		logger.info({ queue: queueName }, 'worker started');
	}

	const shutdown = async (): Promise<void> => {
		logger.info('shutting down worker…');
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
