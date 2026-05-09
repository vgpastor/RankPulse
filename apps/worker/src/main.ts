import {
	AiSearchInsights as AiSearchInsightsUseCases,
	type Core as ApplicationCore,
	BingWebmasterInsights as BingWebmasterInsightsUseCases,
	EntityAwareness as EntityAwarenessUseCases,
	ExperienceAnalytics as ExperienceAnalyticsUseCases,
	MacroContext as MacroContextUseCases,
	MetaAdsAttribution as MetaAdsAttributionUseCases,
	ProjectManagement as ProjectManagementUseCases,
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
	SearchConsoleInsights as SearchConsoleInsightsUseCases,
	TrafficAnalytics as TrafficAnalyticsUseCases,
	WebPerformance as WebPerformanceUseCases,
} from '@rankpulse/application';
import { AiSearchInsights as AiSearchInsightsDomain } from '@rankpulse/domain';
import {
	AiSearchInsights as AiSearchInsightsInfra,
	Crypto,
	DrizzlePersistence,
	Events,
	Queue as QueueAdapters,
} from '@rankpulse/infrastructure';
import { buildManifestProviderRegistry, effectiveQueueRateLimit } from '@rankpulse/provider-core';
import { SystemClock, SystemIdGenerator } from '@rankpulse/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pino } from 'pino';
import { loadEnv } from './config/env.js';
import { createHealthServer } from './health-server.js';
import { buildIngestRouter } from './processors/ingest-router.js';
import { ProviderFetchProcessor } from './processors/provider-fetch.processor.js';
import { ALL_PROVIDER_MANIFESTS } from './providers/manifests.js';

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
	const serpObservationRepo = new DrizzlePersistence.DrizzleSerpObservationRepository(drizzle.db);
	const rankedKeywordObservationRepo = new DrizzlePersistence.DrizzleRankedKeywordObservationRepository(
		drizzle.db,
	);
	const projectRepo = new DrizzlePersistence.DrizzleProjectRepository(drizzle.db);
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
	const ga4PropertyRepo = new DrizzlePersistence.DrizzleGa4PropertyRepository(drizzle.db);
	const ga4DailyMetricRepo = new DrizzlePersistence.DrizzleGa4DailyMetricRepository(drizzle.db);
	const bingPropertyRepo = new DrizzlePersistence.DrizzleBingPropertyRepository(drizzle.db);
	const bingTrafficObservationRepo = new DrizzlePersistence.DrizzleBingTrafficObservationRepository(
		drizzle.db,
	);
	const monitoredDomainRepo = new DrizzlePersistence.DrizzleMonitoredDomainRepository(drizzle.db);
	const radarRankSnapshotRepo = new DrizzlePersistence.DrizzleRadarRankSnapshotRepository(drizzle.db);
	const metaPixelRepo = new DrizzlePersistence.DrizzleMetaPixelRepository(drizzle.db);
	const metaAdAccountRepo = new DrizzlePersistence.DrizzleMetaAdAccountRepository(drizzle.db);
	const metaPixelEventDailyRepo = new DrizzlePersistence.DrizzleMetaPixelEventDailyRepository(drizzle.db);
	const metaAdsInsightDailyRepo = new DrizzlePersistence.DrizzleMetaAdsInsightDailyRepository(drizzle.db);
	const clarityProjectRepo = new DrizzlePersistence.DrizzleClarityProjectRepository(drizzle.db);
	const experienceSnapshotRepo = new DrizzlePersistence.DrizzleExperienceSnapshotRepository(drizzle.db);
	const brandPromptRepo = new DrizzlePersistence.DrizzleBrandPromptRepository(drizzle.db);
	const llmAnswerRepo = new DrizzlePersistence.DrizzleLlmAnswerRepository(drizzle.db);
	const brandWatchlistResolver = new DrizzlePersistence.ProjectBrandWatchlistResolver(drizzle.db);

	const mentionExtractor = env.ANTHROPIC_API_KEY
		? new AiSearchInsightsInfra.AnthropicMentionExtractor({ apiKey: env.ANTHROPIC_API_KEY })
		: ({
				async extract() {
					logger.warn(
						'[ai-search-insights] ANTHROPIC_API_KEY not set — captured LLM responses will be persisted with empty mentions',
					);
					return {
						mentions: [],
						judgeTokenUsage: AiSearchInsightsDomain.TokenUsage.zero(),
						judgeCostCents: 0,
					};
				},
			} satisfies AiSearchInsightsDomain.MentionExtractor);

	const vault = new Crypto.LibsodiumCredentialVault(env.RANKPULSE_MASTER_KEY);
	const eventPublisher = new Events.InMemoryEventPublisher();

	// ADR 0002 Phase 6 — manifest-driven provider registry replaces the
	// imperative `new XProvider()` registrations. The DATAFORSEO_API_BASE_URL
	// env var is no longer threaded here; manifests declare their baseUrl
	// statically. (DataForSEO's manifest sets the production URL; tests
	// override via `fetchImpl` mock.)
	const manifestRegistry = buildManifestProviderRegistry(ALL_PROVIDER_MANIFESTS);

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
	const recordSerpObservationUseCase = new RankTrackingUseCases.RecordSerpObservationUseCase(
		serpObservationRepo,
		SystemClock,
		SystemIdGenerator,
	);
	const ingestRankedKeywordsUseCase = new RankTrackingUseCases.IngestRankedKeywordsUseCase(
		projectRepo,
		rankedKeywordObservationRepo,
		SystemIdGenerator,
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
	const ingestGa4RowsUseCase = new TrafficAnalyticsUseCases.IngestGa4RowsUseCase(
		ga4PropertyRepo,
		ga4DailyMetricRepo,
		SystemIdGenerator,
		eventPublisher,
		SystemClock,
	);
	const ingestBingTrafficUseCase = new BingWebmasterInsightsUseCases.IngestBingTrafficUseCase(
		bingPropertyRepo,
		bingTrafficObservationRepo,
		eventPublisher,
		SystemClock,
	);
	const recordRadarRankUseCase = new MacroContextUseCases.RecordRadarRankUseCase(
		monitoredDomainRepo,
		radarRankSnapshotRepo,
		eventPublisher,
		SystemClock,
	);
	const ingestMetaPixelEventsUseCase = new MetaAdsAttributionUseCases.IngestMetaPixelEventsUseCase(
		metaPixelRepo,
		metaPixelEventDailyRepo,
		eventPublisher,
		SystemClock,
	);
	const ingestMetaAdsInsightsUseCase = new MetaAdsAttributionUseCases.IngestMetaAdsInsightsUseCase(
		metaAdAccountRepo,
		metaAdsInsightDailyRepo,
		eventPublisher,
		SystemClock,
	);
	const recordExperienceSnapshotUseCase = new ExperienceAnalyticsUseCases.RecordExperienceSnapshotUseCase(
		clarityProjectRepo,
		experienceSnapshotRepo,
		eventPublisher,
		SystemClock,
	);
	const recordLlmAnswerUseCase = new AiSearchInsightsUseCases.RecordLlmAnswerUseCase(
		brandPromptRepo,
		llmAnswerRepo,
		brandWatchlistResolver,
		mentionExtractor,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);

	// ADR 0002 Phase 5 — IngestRouter activation.
	//
	// Each manifest's `IngestBinding.useCaseKey` maps to one entry in this
	// adapter map. The adapter takes the router's generic
	// `{rawPayloadId, rows, systemParams}` shape and translates it to the
	// specific use case's command. Two patterns:
	//
	//  - Rows-array use cases (GSC, GA4, Bing, Meta ads-insights, Wikipedia):
	//    pass `rows` through as-is — the manifest's ACL produces the same
	//    row shape the use case expects.
	//
	//  - Single-snapshot use cases (PSI, Clarity, Cloudflare Radar, AI search):
	//    the ACL wraps a single object in `[snapshot]`; the adapter
	//    destructures `rows[0]` into the use case's command.
	//
	// DataForSEO ranking-observation fan-out (1 SERP → N project domains)
	// stays in the legacy if-else dispatch (see ingest-router.ts header for
	// rationale); the router returns false for it and the processor falls
	// through.
	const ingestUseCases: Record<string, ApplicationCore.IngestUseCase> = {
		'search-console-insights:ingest-gsc-rows': {
			async execute({ rawPayloadId, rows, systemParams }) {
				await ingestGscRowsUseCase.execute({
					gscPropertyId: systemParams.gscPropertyId as string,
					rawPayloadId,
					rows: rows as Parameters<typeof ingestGscRowsUseCase.execute>[0]['rows'],
				});
			},
		},
		'traffic-analytics:ingest-ga4-rows': {
			async execute({ rawPayloadId, rows, systemParams }) {
				await ingestGa4RowsUseCase.execute({
					ga4PropertyId: systemParams.ga4PropertyId as string,
					rawPayloadId,
					rows: rows as Parameters<typeof ingestGa4RowsUseCase.execute>[0]['rows'],
				});
			},
		},
		'bing-webmaster-insights:ingest-bing-traffic': {
			async execute({ rawPayloadId, rows, systemParams }) {
				await ingestBingTrafficUseCase.execute({
					bingPropertyId: systemParams.bingPropertyId as string,
					rawPayloadId,
					rows: rows as Parameters<typeof ingestBingTrafficUseCase.execute>[0]['rows'],
				});
			},
		},
		'entity-awareness:ingest-wikipedia-pageviews': {
			async execute({ rows, systemParams }) {
				await ingestWikipediaPageviewsUseCase.execute({
					articleId: systemParams.wikipediaArticleId as string,
					rows: rows as Parameters<typeof ingestWikipediaPageviewsUseCase.execute>[0]['rows'],
				});
			},
		},
		'meta-ads-attribution:ingest-meta-ads-insights': {
			async execute({ rawPayloadId, rows, systemParams }) {
				await ingestMetaAdsInsightsUseCase.execute({
					metaAdAccountId: systemParams.metaAdAccountId as string,
					rawPayloadId,
					rows: rows as Parameters<typeof ingestMetaAdsInsightsUseCase.execute>[0]['rows'],
				});
			},
		},
		'web-performance:record-pagespeed-snapshot': {
			async execute({ rows, systemParams }) {
				const snap = rows[0] as {
					observedAt: Date;
					lcpMs: number | null;
					inpMs: number | null;
					cls: number | null;
					fcpMs: number | null;
					ttfbMs: number | null;
					performanceScore: number | null;
					seoScore: number | null;
					accessibilityScore: number | null;
					bestPracticesScore: number | null;
				};
				if (!snap) return;
				await recordPageSpeedSnapshotUseCase.execute({
					trackedPageId: systemParams.trackedPageId as string,
					observedAt: snap.observedAt,
					lcpMs: snap.lcpMs,
					inpMs: snap.inpMs,
					cls: snap.cls,
					fcpMs: snap.fcpMs,
					ttfbMs: snap.ttfbMs,
					performanceScore: snap.performanceScore,
					seoScore: snap.seoScore,
					accessibilityScore: snap.accessibilityScore,
					bestPracticesScore: snap.bestPracticesScore,
				});
			},
		},
		'macro-context:record-radar-rank': {
			async execute({ rawPayloadId, rows, systemParams }) {
				const snap = rows[0] as {
					observedDate: string;
					rank: number | null;
					bucket: string | null;
					categories: Record<string, number>;
				};
				if (!snap) return;
				await recordRadarRankUseCase.execute({
					monitoredDomainId: systemParams.monitoredDomainId as string,
					observedDate: snap.observedDate,
					rank: snap.rank,
					bucket: snap.bucket,
					categories: snap.categories,
					rawPayloadId,
				});
			},
		},
		'experience-analytics:record-experience-snapshot': {
			async execute({ rawPayloadId, rows, systemParams }) {
				const snap = rows[0] as {
					observedDate: string;
					sessionsCount: number;
					botSessionsCount: number;
					distinctUserCount: number;
					pagesPerSession: number;
					rageClicks: number;
					deadClicks: number;
					avgEngagementSeconds: number;
					avgScrollDepth: number;
				};
				if (!snap) return;
				await recordExperienceSnapshotUseCase.execute({
					clarityProjectId: systemParams.clarityProjectId as string,
					observedDate: snap.observedDate,
					sessionsCount: snap.sessionsCount,
					botSessionsCount: snap.botSessionsCount,
					distinctUserCount: snap.distinctUserCount,
					pagesPerSession: snap.pagesPerSession,
					rageClicks: snap.rageClicks,
					deadClicks: snap.deadClicks,
					avgEngagementSeconds: snap.avgEngagementSeconds,
					avgScrollDepth: snap.avgScrollDepth,
					rawPayloadId,
				});
			},
		},
		'rank-tracking:ingest-ranked-keywords': {
			async execute({ rawPayloadId, rows, systemParams }) {
				const projectId = systemParams.projectId as string | undefined;
				const targetDomain = systemParams.targetDomain as string | undefined;
				const country = (systemParams.country as string | undefined) ?? '';
				const language = (systemParams.language as string | undefined) ?? '';
				if (!projectId || !targetDomain) {
					logger.warn(
						{ systemParams },
						'rank-tracking:ingest-ranked-keywords skipped: missing projectId or targetDomain in systemParams',
					);
					return;
				}
				await ingestRankedKeywordsUseCase.execute({
					projectId,
					targetDomain,
					country,
					language,
					rawPayloadId,
					rows: rows as Parameters<typeof ingestRankedKeywordsUseCase.execute>[0]['rows'],
				});
			},
		},
		'ai-search-insights:record-llm-answer': {
			async execute({ rawPayloadId, rows, systemParams }) {
				const answer = rows[0] as Parameters<typeof recordLlmAnswerUseCase.execute>[0]['response'];
				if (!answer) return;
				const brandPromptId = systemParams.brandPromptId as string | undefined;
				const country = systemParams.country as string | undefined;
				const language = systemParams.language as string | undefined;
				if (!brandPromptId || !country || !language) {
					logger.warn(
						{ systemParams },
						'ai-search ingest skipped: missing brandPromptId / country / language in systemParams',
					);
					return;
				}
				await recordLlmAnswerUseCase.execute({
					brandPromptId,
					country,
					language,
					rawPayloadId,
					response: answer,
				});
			},
		},
	};

	const ingestRouter = buildIngestRouter(ALL_PROVIDER_MANIFESTS, ingestUseCases);

	const processor = new ProviderFetchProcessor({
		registry: manifestRegistry,
		ingestRouter,
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
		ga4PropertyRepo,
		bingPropertyRepo,
		monitoredDomainRepo,
		metaPixelRepo,
		metaAdAccountRepo,
		clarityProjectRepo,
		vault,
		resolveCredentialUseCase,
		recordApiUsageUseCase,
		recordRankingObservationUseCase,
		recordSerpObservationUseCase,
		recordTop10HitsForSuggestionsUseCase,
		ingestGscRowsUseCase,
		ingestWikipediaPageviewsUseCase,
		recordPageSpeedSnapshotUseCase,
		ingestGa4RowsUseCase,
		ingestBingTrafficUseCase,
		recordRadarRankUseCase,
		ingestMetaPixelEventsUseCase,
		ingestMetaAdsInsightsUseCase,
		recordExperienceSnapshotUseCase,
		clock: SystemClock,
		ids: SystemIdGenerator,
		logger,
	});

	const connection = new IORedis(env.REDIS_URL, {
		maxRetriesPerRequest: null,
		enableReadyCheck: false,
	});

	const workers: Worker[] = [];
	for (const manifest of manifestRegistry.list()) {
		const queueName = QueueAdapters.providerQueueName(manifest.id);
		// Pull the effective rate-limit envelope for the provider's queue from the
		// manifest. BullMQ enforces this at the worker level: when more than `max`
		// jobs land within `duration` ms, the surplus is held back until a slot
		// frees up — instead of failing with the upstream's quota error. PSI is the
		// classic case (1 call/sec); without a limiter, run-now of N PSI defs slams
		// 21 calls into a 1s window and 17 of them get HTTP 429 QUOTA_EXCEEDED. With
		// the limiter the same workload spreads to ~21s and lands all 21 cleanly.
		// Providers without a configured rateLimit (extremely rare; the type system
		// requires one per descriptor) fall through to no limiter and the existing
		// concurrency cap. The min-tokens/sec helper picks the most restrictive
		// endpoint policy when a provider has multiple endpoints with different
		// quotas — see `effectiveQueueRateLimit` for the rationale.
		const limiter = effectiveQueueRateLimit(manifest);
		if (limiter) {
			logger.info(
				{ queue: queueName, max: limiter.max, durationMs: limiter.duration },
				'worker limiter configured',
			);
		}
		const worker = new Worker(
			queueName,
			async (job) => {
				logger.info({ queue: queueName, jobId: job.id }, 'processing fetch job');
				await processor.handle(job.data);
			},
			{
				connection,
				concurrency: env.WORKER_CONCURRENCY,
				...(limiter ? { limiter } : {}),
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
