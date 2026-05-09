import type { Provider, ValueProvider } from '@nestjs/common';
import {
	AiSearchInsights as AISIUseCases,
	type Core as ApplicationCore,
	BingWebmasterInsights as BWIUseCases,
	EntityAwareness as EAUseCases,
	ExperienceAnalytics as EXAUseCases,
	IdentityAccess as IAUseCases,
	MetaAdsAttribution as MAAUseCases,
	MacroContext as MCUseCases,
	ProviderConnectivity as PCUseCases,
	ProjectManagement as PMUseCases,
	RankTracking as RTUseCases,
	SearchConsoleInsights as SCIUseCases,
	TrafficAnalytics as TAUseCases,
	WebPerformance as WPUseCases,
} from '@rankpulse/application';

type SharedDeps = ApplicationCore.SharedDeps;

import {
	type AiSearchInsights,
	AiSearchInsights as AiSearchInsightsDomain,
	type ProjectManagement,
} from '@rankpulse/domain';
import {
	AiSearchInsights as AiSearchInsightsInfra,
	Crypto,
	DrizzlePersistence,
	Events,
	Queue as QueueAdapters,
} from '@rankpulse/infrastructure';
import { anthropicProviderManifest } from '@rankpulse/provider-anthropic';
import { bingProviderManifest } from '@rankpulse/provider-bing';
import { brevoProviderManifest } from '@rankpulse/provider-brevo';
import { cloudflareRadarProviderManifest } from '@rankpulse/provider-cloudflare-radar';
import { buildManifestProviderRegistry } from '@rankpulse/provider-core';
import { dataforseoProviderManifest } from '@rankpulse/provider-dataforseo';
import { ga4ProviderManifest } from '@rankpulse/provider-ga4';
import { googleAiStudioProviderManifest } from '@rankpulse/provider-google-ai-studio';
import { googleSearchConsoleProviderManifest } from '@rankpulse/provider-gsc';
import { metaProviderManifest } from '@rankpulse/provider-meta';
import { microsoftClarityProviderManifest } from '@rankpulse/provider-microsoft-clarity';
import { openaiProviderManifest } from '@rankpulse/provider-openai';
import { pagespeedProviderManifest } from '@rankpulse/provider-pagespeed';
import { perplexityProviderManifest } from '@rankpulse/provider-perplexity';
import { wikipediaProviderManifest } from '@rankpulse/provider-wikipedia';
import { InvalidInputError, SystemClock, SystemIdGenerator } from '@rankpulse/shared';
import { JwtService } from '../common/auth/jwt.service.js';
import type { AppEnv } from '../config/env.js';
import { Tokens } from './tokens.js';

const value = <T>(token: symbol, useValue: T): ValueProvider<T> => ({ provide: token, useValue });

/**
 * Stand-in `MentionExtractor` used when `ANTHROPIC_API_KEY` is not set. The
 * worker still records the captured raw response so historical data isn't
 * lost; mention rows just stay empty until the operator configures a real
 * extractor. We log a one-line warning at composition time (not on every
 * call) so the operator notices the missing config without flooding logs.
 */
const noopMentionExtractor = (): AiSearchInsights.MentionExtractor => {
	// eslint-disable-next-line no-console
	console.warn(
		'[ai-search-insights] ANTHROPIC_API_KEY not set — mention extraction disabled. ' +
			'Captured LLM responses will be persisted with empty mentions until a key is configured.',
	);
	return {
		async extract() {
			return {
				mentions: [],
				judgeTokenUsage: AiSearchInsightsDomain.TokenUsage.zero(),
				judgeCostCents: 0,
			};
		},
	};
};

export interface BootstrapResult {
	providers: Provider[];
	close: () => Promise<void>;
}

/**
 * Builds every adapter and use case the application needs, wiring them into
 * NestJS providers keyed by Tokens. Controllers depend only on these tokens,
 * never on concrete implementations — keeping the framework boundary thin.
 *
 * Each bounded context's wiring lives in its own
 * `packages/application/src/<context>/module.ts` (`ContextModule.compose`).
 * This root assembles the cross-cutting infrastructure (drizzle, redis, jwt,
 * crypto, the provider registry) and threads it into every module via the
 * opaque `SharedDeps` brand. Returned `useCases`, `eventHandlers` and
 * `schemaTables` are merged centrally — adding a context is one new entry
 * in `compose...` + the module file, never edits to this scaffolding.
 */
export function buildCompositionRoot(env: AppEnv): BootstrapResult {
	const drizzle = DrizzlePersistence.createDrizzleClient({
		connectionString: env.DATABASE_URL,
	});

	const passwordHasher = new Crypto.Argon2PasswordHasher();
	const apiTokenGenerator = new Crypto.Sha256ApiTokenGenerator();
	const credentialVault = new Crypto.LibsodiumCredentialVault(env.RANKPULSE_MASTER_KEY);
	const eventPublisher = new Events.InMemoryEventPublisher();
	const jwtService = new JwtService(env.JWT_SECRET, env.JWT_TTL_SECONDS);

	const orgRepo = new DrizzlePersistence.DrizzleOrganizationRepository(drizzle.db);
	const userRepo = new DrizzlePersistence.DrizzleUserRepository(drizzle.db);
	const membershipRepo = new DrizzlePersistence.DrizzleMembershipRepository(drizzle.db);
	const apiTokenRepo = new DrizzlePersistence.DrizzleApiTokenRepository(drizzle.db);
	const portfolioRepo = new DrizzlePersistence.DrizzlePortfolioRepository(drizzle.db);
	const projectRepo = new DrizzlePersistence.DrizzleProjectRepository(drizzle.db);
	const keywordListRepo = new DrizzlePersistence.DrizzleKeywordListRepository(drizzle.db);
	const competitorRepo = new DrizzlePersistence.DrizzleCompetitorRepository(drizzle.db);
	const competitorSuggestionRepo = new DrizzlePersistence.DrizzleCompetitorSuggestionRepository(drizzle.db);

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
	const gscPropertyRepo = new DrizzlePersistence.DrizzleGscPropertyRepository(drizzle.db);
	const gscObservationRepo = new DrizzlePersistence.DrizzleGscPerformanceObservationRepository(drizzle.db);
	const gscCockpitReadModel = new DrizzlePersistence.DrizzleGscCockpitReadModel(drizzle.db);
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
	const llmAnswerReadModel = new DrizzlePersistence.DrizzleLlmAnswerReadModel(drizzle.db);
	const brandWatchlistResolver = new DrizzlePersistence.ProjectBrandWatchlistResolver(drizzle.db);

	const jobScheduler = new QueueAdapters.BullMqJobScheduler({
		connection: { url: env.REDIS_URL },
	});

	// ADR 0002 Phase 6 — manifest-driven registry. The 14 imperative
	// `new XProvider()` registrations collapsed to one array; each
	// manifest's `buildHttpClient(http)` instantiates the matching
	// `XHttpClient` (BaseHttpClient subclass) once at boot.
	const providerRegistry = buildManifestProviderRegistry([
		dataforseoProviderManifest,
		googleSearchConsoleProviderManifest,
		ga4ProviderManifest,
		pagespeedProviderManifest,
		wikipediaProviderManifest,
		bingProviderManifest,
		cloudflareRadarProviderManifest,
		metaProviderManifest,
		microsoftClarityProviderManifest,
		brevoProviderManifest,
		openaiProviderManifest,
		anthropicProviderManifest,
		perplexityProviderManifest,
		googleAiStudioProviderManifest,
	]);

	// `ScheduleEndpointFetch` is built first because it's needed by the
	// auto-schedule handlers each context module emits via `compose(deps)`.
	// Its dependency surface is identical to the other provider-connectivity
	// use cases — the module returns it under the same instance below.
	const scheduleEndpointFetch = new PCUseCases.ScheduleEndpointFetchUseCase(
		jobDefRepo,
		jobScheduler,
		{
			validate: (providerId, endpointId, params) => {
				const descriptor = providerRegistry.endpoint(providerId, endpointId);
				const parsed = descriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(
						`Invalid params for ${providerId}/${endpointId}: ${parsed.error.message}`,
					);
				}
				return parsed.data as Record<string, unknown>;
			},
		},
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);

	// ADR 0002 Phase 4a — the auto-schedule logger is shared across every
	// bounded context's auto-schedule handlers. Kept here (vs. per-context)
	// because the logger backend is an infrastructure decision: today
	// console.log; tomorrow pino with a request id.
	const autoScheduleLogger = {
		info: (meta: object, msg: string) => {
			// eslint-disable-next-line no-console
			console.log(`[auto-schedule] ${msg}`, meta);
		},
		error: (meta: object, msg: string) => {
			// eslint-disable-next-line no-console
			console.error(`[auto-schedule] ${msg}`, meta);
		},
		child: (bindings: object) => ({
			info: (meta: object, msg: string) => {
				// eslint-disable-next-line no-console
				console.log(`[auto-schedule] ${msg}`, { ...bindings, ...meta });
			},
			error: (meta: object, msg: string) => {
				// eslint-disable-next-line no-console
				console.error(`[auto-schedule] ${msg}`, { ...bindings, ...meta });
			},
		}),
	};

	// Sub-issue #61 of #27 — AI Brand Radar foundation.
	// MentionExtractor: optional. If ANTHROPIC_API_KEY is missing, we wire a
	// no-op extractor that returns empty mentions so the worker still
	// persists raw responses without crashing. The operator gets a clear
	// log line directing them to set the key once they want extraction.
	const mentionExtractor: AiSearchInsights.MentionExtractor = env.ANTHROPIC_API_KEY
		? new AiSearchInsightsInfra.AnthropicMentionExtractor({ apiKey: env.ANTHROPIC_API_KEY })
		: noopMentionExtractor();

	// One typed `compose(deps)` per bounded context. Each module narrows the
	// opaque `SharedDeps` to its own `<Context>Deps` shape internally; this
	// scope only owns the cross-cutting deps (logger, schedule executor,
	// shared clock/ids/events).
	const identityAccess = IAUseCases.identityAccessModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		orgRepo,
		userRepo,
		membershipRepo,
		apiTokenRepo,
		passwordHasher,
		apiTokenGenerator,
		identityAccessSchemaTables: DrizzlePersistence.schema.identityAccessSchemaTables,
	} satisfies IAUseCases.IdentityAccessDeps as unknown as SharedDeps);

	const projectManagement = PMUseCases.projectManagementModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		projectRepo,
		portfolioRepo,
		keywordListRepo,
		competitorRepo,
		competitorSuggestionRepo,
		// BACKLOG #18 — project-management's `ListCompetitorSuggestions` needs
		// the project's tracked-keyword count to evaluate the eligibility ratio.
		// We don't leak the rank-tracking aggregate; we expose a tiny lambda
		// over the tracked-keyword repo so suggestions stay project-management-pure.
		trackedKeywordCountForProject: (projectId) =>
			trackedKeywordRepo.countForProject(projectId as ProjectManagement.ProjectId),
		projectManagementSchemaTables: DrizzlePersistence.schema.projectManagementSchemaTables,
	} satisfies PMUseCases.ProjectManagementDeps as unknown as SharedDeps);

	const providerConnectivity = PCUseCases.providerConnectivityModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		credentialRepo,
		credentialVault,
		jobDefRepo,
		jobRunRepo,
		apiUsageRepo,
		jobScheduler,
		credentialFormatValidator: {
			validate: (providerId, plaintextSecret) => {
				providerRegistry.get(providerId).validateCredentialPlaintext(plaintextSecret);
			},
		},
		endpointParamsValidator: {
			validate: (providerId, endpointId, params) => {
				const descriptor = providerRegistry.endpoint(providerId, endpointId);
				const parsed = descriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(
						`Invalid params for ${providerId}/${endpointId}: ${parsed.error.message}`,
					);
				}
				return parsed.data as Record<string, unknown>;
			},
		},
		providerConnectivitySchemaTables: DrizzlePersistence.schema.providerConnectivitySchemaTables,
	} satisfies PCUseCases.ProviderConnectivityDeps as unknown as SharedDeps);

	const rankTracking = RTUseCases.rankTrackingModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		trackedKeywordRepo,
		observationRepo,
		serpObservationRepo,
		rankedKeywordObservationRepo,
		projectRepo,
		competitorRepo,
		rankTrackingSchemaTables: DrizzlePersistence.schema.rankTrackingSchemaTables,
	} satisfies RTUseCases.RankTrackingDeps as unknown as SharedDeps);

	// Per-context deps with auto-schedule include `scheduleEndpointFetch` and
	// `logger` so the module's `buildAutoScheduleHandlers` call has what it
	// needs. AI search additionally needs `projects` and `credentials` for
	// its `dynamicSchedules` resolver.
	const autoScheduleSurface = {
		scheduleEndpointFetch,
		logger: autoScheduleLogger,
	};

	const searchConsoleInsights = SCIUseCases.searchConsoleInsightsModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		gscPropertyRepo,
		gscObservationRepo,
		gscCockpitReadModel,
		projectRepo,
		searchConsoleInsightsSchemaTables: DrizzlePersistence.schema.searchConsoleInsightsSchemaTables,
		...autoScheduleSurface,
	} satisfies SCIUseCases.SearchConsoleInsightsDeps as unknown as SharedDeps);

	const webPerformance = WPUseCases.webPerformanceModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		trackedPageRepo,
		pageSpeedSnapshotRepo,
		webPerformanceSchemaTables: DrizzlePersistence.schema.webPerformanceSchemaTables,
		...autoScheduleSurface,
	} satisfies WPUseCases.WebPerformanceDeps as unknown as SharedDeps);

	const entityAwareness = EAUseCases.entityAwarenessModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		wikipediaArticleRepo,
		wikipediaPageviewRepo,
		entityAwarenessSchemaTables: DrizzlePersistence.schema.entityAwarenessSchemaTables,
		...autoScheduleSurface,
	} satisfies EAUseCases.EntityAwarenessDeps as unknown as SharedDeps);

	const trafficAnalytics = TAUseCases.trafficAnalyticsModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		ga4PropertyRepo,
		ga4DailyMetricRepo,
		trafficAnalyticsSchemaTables: DrizzlePersistence.schema.trafficAnalyticsSchemaTables,
		...autoScheduleSurface,
	} satisfies TAUseCases.TrafficAnalyticsDeps as unknown as SharedDeps);

	const bingWebmasterInsights = BWIUseCases.bingWebmasterInsightsModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		bingPropertyRepo,
		bingTrafficObservationRepo,
		bingWebmasterInsightsSchemaTables: DrizzlePersistence.schema.bingWebmasterInsightsSchemaTables,
		...autoScheduleSurface,
	} satisfies BWIUseCases.BingWebmasterInsightsDeps as unknown as SharedDeps);

	const macroContext = MCUseCases.macroContextModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		monitoredDomainRepo,
		radarRankSnapshotRepo,
		macroContextSchemaTables: DrizzlePersistence.schema.macroContextSchemaTables,
		...autoScheduleSurface,
	} satisfies MCUseCases.MacroContextDeps as unknown as SharedDeps);

	const experienceAnalytics = EXAUseCases.experienceAnalyticsModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		clarityProjectRepo,
		experienceSnapshotRepo,
		experienceAnalyticsSchemaTables: DrizzlePersistence.schema.experienceAnalyticsSchemaTables,
		...autoScheduleSurface,
	} satisfies EXAUseCases.ExperienceAnalyticsDeps as unknown as SharedDeps);

	const metaAdsAttribution = MAAUseCases.metaAdsAttributionModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		metaPixelRepo,
		metaAdAccountRepo,
		metaPixelEventDailyRepo,
		metaAdsInsightDailyRepo,
		metaAdsAttributionSchemaTables: DrizzlePersistence.schema.metaAdsAttributionSchemaTables,
		...autoScheduleSurface,
	} satisfies MAAUseCases.MetaAdsAttributionDeps as unknown as SharedDeps);

	const aiSearchInsights = AISIUseCases.aiSearchInsightsModule.compose({
		clock: SystemClock,
		ids: SystemIdGenerator,
		events: eventPublisher,
		brandPromptRepo,
		llmAnswerRepo,
		llmAnswerReadModel,
		brandWatchlistResolver,
		mentionExtractor,
		aiSearchInsightsSchemaTables: DrizzlePersistence.schema.aiSearchInsightsSchemaTables,
		...autoScheduleSurface,
		// dynamicSchedules in `aiSearchInsightsAutoScheduleConfigs` reads
		// project locations + connected credentials at handle-time. These
		// adapter shapes are read directly off the deps cast inside the config
		// callback (see ai-search-insights/event-handlers/auto-schedule.config.ts).
		projects: projectRepo,
		credentials: credentialRepo,
	} as AISIUseCases.AiSearchInsightsDeps as unknown as SharedDeps);

	// Wire every module's auto-schedule (and future) event handlers to the
	// in-memory event publisher. Each `EventHandler.events` is an array of
	// event types it cares about; we register one fanout-friendly listener
	// per (handler, event) pair.
	const allHandlers = [
		...identityAccess.eventHandlers,
		...projectManagement.eventHandlers,
		...providerConnectivity.eventHandlers,
		...rankTracking.eventHandlers,
		...searchConsoleInsights.eventHandlers,
		...webPerformance.eventHandlers,
		...entityAwareness.eventHandlers,
		...trafficAnalytics.eventHandlers,
		...bingWebmasterInsights.eventHandlers,
		...macroContext.eventHandlers,
		...experienceAnalytics.eventHandlers,
		...metaAdsAttribution.eventHandlers,
		...aiSearchInsights.eventHandlers,
	];
	for (const handler of allHandlers) {
		for (const eventType of handler.events) {
			eventPublisher.on(eventType, (event) => {
				void handler.handle(event);
			});
		}
	}

	const u = (m: { useCases: Record<string, unknown> }) => m.useCases;
	const ia = u(identityAccess);
	const pm = u(projectManagement);
	const pc = u(providerConnectivity);
	const rt = u(rankTracking);
	const sci = u(searchConsoleInsights);
	const wp = u(webPerformance);
	const ea = u(entityAwareness);
	const ta = u(trafficAnalytics);
	const bwi = u(bingWebmasterInsights);
	const mc = u(macroContext);
	const exa = u(experienceAnalytics);
	const maa = u(metaAdsAttribution);
	const aisi = u(aiSearchInsights);

	const providers: Provider[] = [
		value(Tokens.AppEnv, env),
		value(Tokens.DrizzleClient, drizzle),
		value(Tokens.JwtService, jwtService),
		value(Tokens.Clock, SystemClock),
		value(Tokens.IdGenerator, SystemIdGenerator),
		value(Tokens.EventPublisher, eventPublisher),
		value(Tokens.PasswordHasher, passwordHasher),
		value(Tokens.ApiTokenGenerator, apiTokenGenerator),

		// identity-access
		value(Tokens.OrganizationRepository, orgRepo),
		value(Tokens.UserRepository, userRepo),
		value(Tokens.MembershipRepository, membershipRepo),
		value(Tokens.ApiTokenRepository, apiTokenRepo),
		value(Tokens.RegisterOrganization, ia.RegisterOrganization),
		value(Tokens.AuthenticateUser, ia.AuthenticateUser),
		value(Tokens.InviteUser, ia.InviteUser),
		value(Tokens.IssueApiToken, ia.IssueApiToken),

		// project-management
		value(Tokens.PortfolioRepository, portfolioRepo),
		value(Tokens.ProjectRepository, projectRepo),
		value(Tokens.KeywordListRepository, keywordListRepo),
		value(Tokens.CompetitorRepository, competitorRepo),
		value(Tokens.CompetitorSuggestionRepository, competitorSuggestionRepo),
		value(Tokens.CreateProject, pm.CreateProject),
		value(Tokens.AddDomainToProject, pm.AddDomainToProject),
		value(Tokens.AddProjectLocation, pm.AddProjectLocation),
		value(Tokens.AddCompetitor, pm.AddCompetitor),
		value(Tokens.ImportKeywords, pm.ImportKeywords),
		value(Tokens.CreatePortfolio, pm.CreatePortfolio),
		value(Tokens.ListPortfolios, pm.ListPortfolios),
		value(Tokens.GetPortfolio, pm.GetPortfolio),
		value(Tokens.RenamePortfolio, pm.RenamePortfolio),
		value(Tokens.DeletePortfolio, pm.DeletePortfolio),
		value(Tokens.ListCompetitorSuggestions, pm.ListCompetitorSuggestions),
		value(Tokens.PromoteCompetitorSuggestion, pm.PromoteCompetitorSuggestion),
		value(Tokens.DismissCompetitorSuggestion, pm.DismissCompetitorSuggestion),

		// provider-connectivity
		value(Tokens.CredentialRepository, credentialRepo),
		value(Tokens.JobDefinitionRepository, jobDefRepo),
		value(Tokens.JobRunRepository, jobRunRepo),
		value(Tokens.RawPayloadRepository, rawPayloadRepo),
		value(Tokens.ApiUsageRepository, apiUsageRepo),
		value(Tokens.CredentialVault, credentialVault),
		value(Tokens.JobScheduler, jobScheduler),
		value(Tokens.ProviderRegistry, providerRegistry),
		value(Tokens.RegisterProviderCredential, pc.RegisterProviderCredential),
		value(Tokens.ResolveProviderCredential, pc.ResolveProviderCredential),
		// `ScheduleEndpointFetch` is intentionally pinned to the instance
		// constructed above (used by the module's auto-schedule handlers);
		// the module returns the same instance under its useCase key so
		// controllers and handlers share state (e.g. the idempotency map).
		value(Tokens.ScheduleEndpointFetch, scheduleEndpointFetch),
		value(Tokens.TriggerJobDefinitionRun, pc.TriggerJobDefinitionRun),
		value(Tokens.ListJobDefinitions, pc.ListJobDefinitions),
		value(Tokens.GetJobDefinition, pc.GetJobDefinition),
		value(Tokens.UpdateJobDefinition, pc.UpdateJobDefinition),
		value(Tokens.DeleteJobDefinition, pc.DeleteJobDefinition),
		value(Tokens.ListJobRuns, pc.ListJobRuns),
		value(Tokens.RecordApiUsage, pc.RecordApiUsage),

		// rank-tracking
		value(Tokens.TrackedKeywordRepository, trackedKeywordRepo),
		value(Tokens.RankingObservationRepository, observationRepo),
		value(Tokens.SerpObservationRepository, serpObservationRepo),
		value(Tokens.RankedKeywordObservationRepository, rankedKeywordObservationRepo),
		value(Tokens.StartTrackingKeyword, rt.StartTrackingKeyword),
		value(Tokens.RecordRankingObservation, rt.RecordRankingObservation),
		value(Tokens.QueryRankingHistory, rt.QueryRankingHistory),
		value(Tokens.RecordSerpObservation, rt.RecordSerpObservation),
		value(Tokens.QuerySerpMap, rt.QuerySerpMap),
		value(Tokens.QuerySerpCompetitorSuggestions, rt.QuerySerpCompetitorSuggestions),
		value(Tokens.IngestRankedKeywords, rt.IngestRankedKeywords),
		value(Tokens.QueryRankedKeywords, rt.QueryRankedKeywords),

		// search-console-insights
		value(Tokens.GscPropertyRepository, gscPropertyRepo),
		value(Tokens.GscPerformanceObservationRepository, gscObservationRepo),
		value(Tokens.GscCockpitReadModel, gscCockpitReadModel),
		value(Tokens.LinkGscProperty, sci.LinkGscProperty),
		value(Tokens.IngestGscRows, sci.IngestGscRows),
		value(Tokens.QueryGscPerformance, sci.QueryGscPerformance),
		value(Tokens.QueryCtrAnomalies, sci.QueryCtrAnomalies),
		value(Tokens.QueryLostOpportunity, sci.QueryLostOpportunity),
		value(Tokens.QueryQuickWinRoi, sci.QueryQuickWinRoi),
		value(Tokens.QueryBrandDecay, sci.QueryBrandDecay),

		// web-performance + entity-awareness
		value(Tokens.WikipediaArticleRepository, wikipediaArticleRepo),
		value(Tokens.WikipediaPageviewObservationRepository, wikipediaPageviewRepo),
		value(Tokens.TrackedPageRepository, trackedPageRepo),
		value(Tokens.PageSpeedSnapshotRepository, pageSpeedSnapshotRepo),
		value(Tokens.TrackPage, wp.TrackPage),
		value(Tokens.UntrackPage, wp.UntrackPage),
		value(Tokens.QueryPageSpeedHistory, wp.QueryPageSpeedHistory),
		value(Tokens.LinkWikipediaArticle, ea.LinkWikipediaArticle),
		value(Tokens.UnlinkWikipediaArticle, ea.UnlinkWikipediaArticle),
		value(Tokens.QueryWikipediaPageviews, ea.QueryWikipediaPageviews),

		// traffic-analytics
		value(Tokens.Ga4PropertyRepository, ga4PropertyRepo),
		value(Tokens.Ga4DailyMetricRepository, ga4DailyMetricRepo),
		value(Tokens.LinkGa4Property, ta.LinkGa4Property),
		value(Tokens.UnlinkGa4Property, ta.UnlinkGa4Property),
		value(Tokens.QueryGa4Metrics, ta.QueryGa4Metrics),

		// bing-webmaster-insights
		value(Tokens.BingPropertyRepository, bingPropertyRepo),
		value(Tokens.BingTrafficObservationRepository, bingTrafficObservationRepo),
		value(Tokens.LinkBingProperty, bwi.LinkBingProperty),
		value(Tokens.UnlinkBingProperty, bwi.UnlinkBingProperty),
		value(Tokens.QueryBingTraffic, bwi.QueryBingTraffic),

		// macro-context
		value(Tokens.MonitoredDomainRepository, monitoredDomainRepo),
		value(Tokens.RadarRankSnapshotRepository, radarRankSnapshotRepo),
		value(Tokens.AddMonitoredDomain, mc.AddMonitoredDomain),
		value(Tokens.RemoveMonitoredDomain, mc.RemoveMonitoredDomain),
		value(Tokens.QueryRadarHistory, mc.QueryRadarHistory),

		// meta-ads-attribution
		value(Tokens.MetaPixelRepository, metaPixelRepo),
		value(Tokens.MetaAdAccountRepository, metaAdAccountRepo),
		value(Tokens.MetaPixelEventDailyRepository, metaPixelEventDailyRepo),
		value(Tokens.MetaAdsInsightDailyRepository, metaAdsInsightDailyRepo),
		value(Tokens.LinkMetaPixel, maa.LinkMetaPixel),
		value(Tokens.UnlinkMetaPixel, maa.UnlinkMetaPixel),
		value(Tokens.LinkMetaAdAccount, maa.LinkMetaAdAccount),
		value(Tokens.UnlinkMetaAdAccount, maa.UnlinkMetaAdAccount),
		value(Tokens.QueryMetaPixelEvents, maa.QueryMetaPixelEvents),
		value(Tokens.QueryMetaAdsInsights, maa.QueryMetaAdsInsights),

		// experience-analytics
		value(Tokens.ClarityProjectRepository, clarityProjectRepo),
		value(Tokens.ExperienceSnapshotRepository, experienceSnapshotRepo),
		value(Tokens.LinkClarityProject, exa.LinkClarityProject),
		value(Tokens.UnlinkClarityProject, exa.UnlinkClarityProject),
		value(Tokens.QueryExperienceHistory, exa.QueryExperienceHistory),

		// ai-search-insights
		value(Tokens.BrandPromptRepository, brandPromptRepo),
		value(Tokens.LlmAnswerRepository, llmAnswerRepo),
		value(Tokens.LlmAnswerReadModel, llmAnswerReadModel),
		value(Tokens.BrandWatchlistResolver, brandWatchlistResolver),
		value(Tokens.MentionExtractor, mentionExtractor),
		value(Tokens.RegisterBrandPrompt, aisi.RegisterBrandPrompt),
		value(Tokens.PauseBrandPrompt, aisi.PauseBrandPrompt),
		value(Tokens.ResumeBrandPrompt, aisi.ResumeBrandPrompt),
		value(Tokens.DeleteBrandPrompt, aisi.DeleteBrandPrompt),
		value(Tokens.ListBrandPrompts, aisi.ListBrandPrompts),
		value(Tokens.RecordLlmAnswer, aisi.RecordLlmAnswer),
		value(Tokens.QueryLlmAnswers, aisi.QueryLlmAnswers),
		value(Tokens.QueryAiSearchPresence, aisi.QueryAiSearchPresence),
		value(Tokens.QueryAiSearchSov, aisi.QueryAiSearchSov),
		value(Tokens.QueryAiSearchCitations, aisi.QueryAiSearchCitations),
		value(Tokens.QueryPromptSovDaily, aisi.QueryPromptSovDaily),
		value(Tokens.QueryCompetitiveMatrix, aisi.QueryCompetitiveMatrix),
		value(Tokens.QueryAiSearchAlerts, aisi.QueryAiSearchAlerts),
	];

	return {
		providers,
		close: async () => {
			await jobScheduler.close();
			await drizzle.close();
		},
	};
}
