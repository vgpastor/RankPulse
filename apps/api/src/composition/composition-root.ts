import type { Provider, ValueProvider } from '@nestjs/common';
import {
	AiSearchInsights as AISIUseCases,
	Core as ApplicationCore,
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

const { buildAutoScheduleHandlers } = ApplicationCore;
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

	const registerOrganization = new IAUseCases.RegisterOrganizationUseCase(
		orgRepo,
		userRepo,
		membershipRepo,
		passwordHasher,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const authenticateUser = new IAUseCases.AuthenticateUserUseCase(userRepo, passwordHasher);
	const inviteUser = new IAUseCases.InviteUserUseCase(
		membershipRepo,
		userRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const issueApiToken = new IAUseCases.IssueApiTokenUseCase(
		membershipRepo,
		apiTokenRepo,
		apiTokenGenerator,
		SystemClock,
		SystemIdGenerator,
	);

	const createProject = new PMUseCases.CreateProjectUseCase(
		projectRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const addDomain = new PMUseCases.AddDomainToProjectUseCase(projectRepo, SystemClock, eventPublisher);
	const addLocation = new PMUseCases.AddProjectLocationUseCase(projectRepo, SystemClock, eventPublisher);
	const addCompetitor = new PMUseCases.AddCompetitorUseCase(
		projectRepo,
		competitorRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const importKeywords = new PMUseCases.ImportKeywordsUseCase(
		projectRepo,
		keywordListRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const createPortfolio = new PMUseCases.CreatePortfolioUseCase(
		portfolioRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const listPortfolios = new PMUseCases.ListPortfoliosUseCase(portfolioRepo);
	const getPortfolio = new PMUseCases.GetPortfolioUseCase(portfolioRepo);
	const renamePortfolio = new PMUseCases.RenamePortfolioUseCase(portfolioRepo);
	const deletePortfolio = new PMUseCases.DeletePortfolioUseCase(portfolioRepo);

	// BACKLOG #18 — competitor auto-discovery. The list use case needs the
	// project's keyword count to evaluate the eligibility ratio. We don't
	// leak the rank-tracking aggregate; we expose a tiny lambda over the
	// tracked-keyword repo so suggestions stay project-management-pure.
	const listCompetitorSuggestions = new PMUseCases.ListCompetitorSuggestionsUseCase(
		competitorSuggestionRepo,
		(projectId) => trackedKeywordRepo.countForProject(projectId as ProjectManagement.ProjectId),
	);
	const promoteCompetitorSuggestion = new PMUseCases.PromoteCompetitorSuggestionUseCase(
		competitorSuggestionRepo,
		competitorRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const dismissCompetitorSuggestion = new PMUseCases.DismissCompetitorSuggestionUseCase(
		competitorSuggestionRepo,
		SystemClock,
	);

	const registerCredential = new PCUseCases.RegisterProviderCredentialUseCase(
		credentialRepo,
		credentialVault,
		{
			validate: (providerId, plaintextSecret) => {
				providerRegistry.get(providerId).validateCredentialPlaintext(plaintextSecret);
			},
		},
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const resolveCredential = new PCUseCases.ResolveProviderCredentialUseCase(
		credentialRepo,
		credentialVault,
		SystemClock,
	);
	const triggerJobDefinitionRun = new PCUseCases.TriggerJobDefinitionRunUseCase(
		jobDefRepo,
		jobScheduler,
		SystemIdGenerator,
	);
	const listJobDefinitions = new PCUseCases.ListJobDefinitionsUseCase(jobDefRepo);
	const getJobDefinition = new PCUseCases.GetJobDefinitionUseCase(jobDefRepo);
	const updateJobDefinition = new PCUseCases.UpdateJobDefinitionUseCase(jobDefRepo, jobScheduler);
	const deleteJobDefinition = new PCUseCases.DeleteJobDefinitionUseCase(jobDefRepo, jobScheduler);
	const listJobRuns = new PCUseCases.ListJobRunsUseCase(jobRunRepo);

	// ADR 0001 — entity-bound endpoints are auto-scheduled by their bounded
	// context's link/add handler (see the AutoScheduleOn... blocks below).
	// `ScheduleEndpointFetchUseCase` no longer carries cross-context resolvers
	// to back-fill systemParams from user-facing identifiers.
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
		// ADR 0001 fully realised: every entity-bound endpoint is now
		// auto-scheduled by its bounded context's link/add handler (see the
		// `eventPublisher.on(...)` blocks below). The SystemParamResolver
		// pattern is gone.
	);
	const recordApiUsage = new PCUseCases.RecordApiUsageUseCase(
		apiUsageRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);

	const startTrackingKeyword = new RTUseCases.StartTrackingKeywordUseCase(
		trackedKeywordRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const recordRankingObservation = new RTUseCases.RecordRankingObservationUseCase(
		trackedKeywordRepo,
		observationRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const queryRankingHistory = new RTUseCases.QueryRankingHistoryUseCase(trackedKeywordRepo, observationRepo);

	const linkGscProperty = new SCIUseCases.LinkGscPropertyUseCase(
		gscPropertyRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const ingestGscRows = new SCIUseCases.IngestGscRowsUseCase(
		gscPropertyRepo,
		gscObservationRepo,
		SystemIdGenerator,
		eventPublisher,
		SystemClock,
	);
	const queryGscPerformance = new SCIUseCases.QueryGscPerformanceUseCase(gscPropertyRepo, gscObservationRepo);

	// Issue #33 — entity-awareness use cases
	const linkWikipediaArticle = new EAUseCases.LinkWikipediaArticleUseCase(
		wikipediaArticleRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const unlinkWikipediaArticle = new EAUseCases.UnlinkWikipediaArticleUseCase(
		wikipediaArticleRepo,
		SystemClock,
		eventPublisher,
	);
	const queryWikipediaPageviews = new EAUseCases.QueryWikipediaPageviewsUseCase(
		wikipediaArticleRepo,
		wikipediaPageviewRepo,
	);

	// Issue #18 — web-performance use cases
	const trackPage = new WPUseCases.TrackPageUseCase(
		trackedPageRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const untrackPage = new WPUseCases.UntrackPageUseCase(trackedPageRepo);
	const queryPageSpeedHistory = new WPUseCases.QueryPageSpeedHistoryUseCase(
		trackedPageRepo,
		pageSpeedSnapshotRepo,
	);

	// Issue #17 — traffic-analytics (GA4) use cases
	const linkGa4Property = new TAUseCases.LinkGa4PropertyUseCase(
		ga4PropertyRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const unlinkGa4Property = new TAUseCases.UnlinkGa4PropertyUseCase(ga4PropertyRepo, SystemClock);
	const queryGa4Metrics = new TAUseCases.QueryGa4MetricsUseCase(ga4PropertyRepo, ga4DailyMetricRepo);

	// Issue #20 — bing-webmaster-insights use cases
	const linkBingProperty = new BWIUseCases.LinkBingPropertyUseCase(
		bingPropertyRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const unlinkBingProperty = new BWIUseCases.UnlinkBingPropertyUseCase(bingPropertyRepo, SystemClock);
	const queryBingTraffic = new BWIUseCases.QueryBingTrafficUseCase(
		bingPropertyRepo,
		bingTrafficObservationRepo,
	);

	// Issue #25 — macro-context use cases
	const addMonitoredDomain = new MCUseCases.AddMonitoredDomainUseCase(
		monitoredDomainRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const removeMonitoredDomain = new MCUseCases.RemoveMonitoredDomainUseCase(monitoredDomainRepo, SystemClock);
	const queryRadarHistory = new MCUseCases.QueryRadarHistoryUseCase(
		monitoredDomainRepo,
		radarRankSnapshotRepo,
	);

	// Issue #45 — meta-ads-attribution use cases
	const linkMetaPixel = new MAAUseCases.LinkMetaPixelUseCase(
		metaPixelRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const unlinkMetaPixel = new MAAUseCases.UnlinkMetaPixelUseCase(metaPixelRepo, SystemClock);
	const linkMetaAdAccount = new MAAUseCases.LinkMetaAdAccountUseCase(
		metaAdAccountRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const unlinkMetaAdAccount = new MAAUseCases.UnlinkMetaAdAccountUseCase(metaAdAccountRepo, SystemClock);
	const queryMetaPixelEvents = new MAAUseCases.QueryMetaPixelEventsUseCase(
		metaPixelRepo,
		metaPixelEventDailyRepo,
	);
	const queryMetaAdsInsights = new MAAUseCases.QueryMetaAdsInsightsUseCase(
		metaAdAccountRepo,
		metaAdsInsightDailyRepo,
	);

	// Issue #43 — experience-analytics use cases
	const linkClarityProject = new EXAUseCases.LinkClarityProjectUseCase(
		clarityProjectRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const unlinkClarityProject = new EXAUseCases.UnlinkClarityProjectUseCase(clarityProjectRepo, SystemClock);
	const queryExperienceHistory = new EXAUseCases.QueryExperienceHistoryUseCase(
		clarityProjectRepo,
		experienceSnapshotRepo,
	);

	// Sub-issue #61 of #27 — AI Brand Radar foundation.
	// MentionExtractor: optional. If ANTHROPIC_API_KEY is missing, we wire a
	// no-op extractor that returns empty mentions so the worker still
	// persists raw responses without crashing. The operator gets a clear
	// log line directing them to set the key once they want extraction.
	const mentionExtractor: AiSearchInsights.MentionExtractor = env.ANTHROPIC_API_KEY
		? new AiSearchInsightsInfra.AnthropicMentionExtractor({ apiKey: env.ANTHROPIC_API_KEY })
		: noopMentionExtractor();

	const registerBrandPrompt = new AISIUseCases.RegisterBrandPromptUseCase(
		brandPromptRepo,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const pauseBrandPrompt = new AISIUseCases.PauseBrandPromptUseCase(
		brandPromptRepo,
		SystemClock,
		eventPublisher,
	);
	const resumeBrandPrompt = new AISIUseCases.ResumeBrandPromptUseCase(
		brandPromptRepo,
		SystemClock,
		eventPublisher,
	);
	const deleteBrandPrompt = new AISIUseCases.DeleteBrandPromptUseCase(brandPromptRepo);
	const listBrandPrompts = new AISIUseCases.ListBrandPromptsUseCase(brandPromptRepo);
	const recordLlmAnswer = new AISIUseCases.RecordLlmAnswerUseCase(
		brandPromptRepo,
		llmAnswerRepo,
		brandWatchlistResolver,
		mentionExtractor,
		SystemClock,
		SystemIdGenerator,
		eventPublisher,
	);
	const queryLlmAnswers = new AISIUseCases.QueryLlmAnswersUseCase(llmAnswerRepo);
	const queryAiSearchPresence = new AISIUseCases.QueryAiSearchPresenceUseCase(llmAnswerReadModel);
	const queryAiSearchSov = new AISIUseCases.QueryAiSearchSovUseCase(llmAnswerReadModel);
	const queryAiSearchCitations = new AISIUseCases.QueryAiSearchCitationsUseCase(llmAnswerReadModel);
	const queryPromptSovDaily = new AISIUseCases.QueryPromptSovDailyUseCase(llmAnswerReadModel);
	const queryCompetitiveMatrix = new AISIUseCases.QueryCompetitiveMatrixUseCase(llmAnswerReadModel);
	const queryAiSearchAlerts = new AISIUseCases.QueryAiSearchAlertsUseCase(llmAnswerReadModel);

	// ADR 0002 Phase 4a — all auto-schedule handlers built from per-context
	// configs via `buildAutoScheduleHandlers`. Each context owns its own
	// `auto-schedule.config.ts` and contributes one or more
	// `AutoScheduleConfig` entries; the factory turns them into
	// EventHandlers wired to a shared logger + scheduleEndpointFetch.
	//
	// The deps cast carries `scheduleEndpointFetch`, `projects`, `credentials`
	// and `logger` so the AI search dynamicSchedules callback can read project
	// locations + connected credentials at handle-time. The opaque `_brand`
	// field on SharedDeps preserves the contract type while letting concrete
	// fields flow through (see `packages/application/src/_core/module.ts`).
	const autoScheduleSharedDeps = {
		_brand: 'SharedDeps' as const,
		scheduleEndpointFetch,
		projects: projectRepo,
		credentials: credentialRepo,
		logger: {
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
		},
	} as unknown as SharedDeps;

	const autoScheduleHandlers = buildAutoScheduleHandlers(autoScheduleSharedDeps, [
		...AISIUseCases.aiSearchInsightsAutoScheduleConfigs,
		...SCIUseCases.searchConsoleInsightsAutoScheduleConfigs,
		...TAUseCases.trafficAnalyticsAutoScheduleConfigs,
		...EAUseCases.entityAwarenessAutoScheduleConfigs,
		...BWIUseCases.bingWebmasterInsightsAutoScheduleConfigs,
		...EXAUseCases.experienceAnalyticsAutoScheduleConfigs,
		...WPUseCases.webPerformanceAutoScheduleConfigs,
		...MCUseCases.macroContextAutoScheduleConfigs,
		...MAAUseCases.metaAdsAttributionAutoScheduleConfigs,
	]);
	for (const handler of autoScheduleHandlers) {
		for (const eventType of handler.events) {
			eventPublisher.on(eventType, (event) => {
				void handler.handle(event);
			});
		}
	}

	const providers: Provider[] = [
		value(Tokens.AppEnv, env),
		value(Tokens.DrizzleClient, drizzle),
		value(Tokens.JwtService, jwtService),
		value(Tokens.Clock, SystemClock),
		value(Tokens.IdGenerator, SystemIdGenerator),
		value(Tokens.EventPublisher, eventPublisher),
		value(Tokens.PasswordHasher, passwordHasher),
		value(Tokens.ApiTokenGenerator, apiTokenGenerator),
		value(Tokens.OrganizationRepository, orgRepo),
		value(Tokens.UserRepository, userRepo),
		value(Tokens.MembershipRepository, membershipRepo),
		value(Tokens.ApiTokenRepository, apiTokenRepo),
		value(Tokens.PortfolioRepository, portfolioRepo),
		value(Tokens.ProjectRepository, projectRepo),
		value(Tokens.KeywordListRepository, keywordListRepo),
		value(Tokens.CompetitorRepository, competitorRepo),
		value(Tokens.CompetitorSuggestionRepository, competitorSuggestionRepo),
		value(Tokens.RegisterOrganization, registerOrganization),
		value(Tokens.AuthenticateUser, authenticateUser),
		value(Tokens.InviteUser, inviteUser),
		value(Tokens.IssueApiToken, issueApiToken),
		value(Tokens.CreateProject, createProject),
		value(Tokens.AddDomainToProject, addDomain),
		value(Tokens.AddProjectLocation, addLocation),
		value(Tokens.AddCompetitor, addCompetitor),
		value(Tokens.ImportKeywords, importKeywords),
		value(Tokens.CreatePortfolio, createPortfolio),
		value(Tokens.ListPortfolios, listPortfolios),
		value(Tokens.GetPortfolio, getPortfolio),
		value(Tokens.RenamePortfolio, renamePortfolio),
		value(Tokens.DeletePortfolio, deletePortfolio),
		value(Tokens.ListCompetitorSuggestions, listCompetitorSuggestions),
		value(Tokens.PromoteCompetitorSuggestion, promoteCompetitorSuggestion),
		value(Tokens.DismissCompetitorSuggestion, dismissCompetitorSuggestion),

		value(Tokens.CredentialRepository, credentialRepo),
		value(Tokens.JobDefinitionRepository, jobDefRepo),
		value(Tokens.JobRunRepository, jobRunRepo),
		value(Tokens.RawPayloadRepository, rawPayloadRepo),
		value(Tokens.ApiUsageRepository, apiUsageRepo),
		value(Tokens.CredentialVault, credentialVault),
		value(Tokens.JobScheduler, jobScheduler),
		value(Tokens.ProviderRegistry, providerRegistry),
		value(Tokens.RegisterProviderCredential, registerCredential),
		value(Tokens.ResolveProviderCredential, resolveCredential),
		value(Tokens.ScheduleEndpointFetch, scheduleEndpointFetch),
		value(Tokens.TriggerJobDefinitionRun, triggerJobDefinitionRun),
		value(Tokens.ListJobDefinitions, listJobDefinitions),
		value(Tokens.GetJobDefinition, getJobDefinition),
		value(Tokens.UpdateJobDefinition, updateJobDefinition),
		value(Tokens.DeleteJobDefinition, deleteJobDefinition),
		value(Tokens.ListJobRuns, listJobRuns),
		value(Tokens.RecordApiUsage, recordApiUsage),

		value(Tokens.TrackedKeywordRepository, trackedKeywordRepo),
		value(Tokens.RankingObservationRepository, observationRepo),
		value(Tokens.StartTrackingKeyword, startTrackingKeyword),
		value(Tokens.RecordRankingObservation, recordRankingObservation),
		value(Tokens.QueryRankingHistory, queryRankingHistory),

		value(Tokens.GscPropertyRepository, gscPropertyRepo),
		value(Tokens.GscPerformanceObservationRepository, gscObservationRepo),
		value(Tokens.LinkGscProperty, linkGscProperty),
		value(Tokens.IngestGscRows, ingestGscRows),
		value(Tokens.QueryGscPerformance, queryGscPerformance),

		value(Tokens.WikipediaArticleRepository, wikipediaArticleRepo),
		value(Tokens.WikipediaPageviewObservationRepository, wikipediaPageviewRepo),
		value(Tokens.TrackedPageRepository, trackedPageRepo),
		value(Tokens.PageSpeedSnapshotRepository, pageSpeedSnapshotRepo),
		value(Tokens.TrackPage, trackPage),
		value(Tokens.UntrackPage, untrackPage),
		value(Tokens.QueryPageSpeedHistory, queryPageSpeedHistory),
		value(Tokens.LinkWikipediaArticle, linkWikipediaArticle),
		value(Tokens.UnlinkWikipediaArticle, unlinkWikipediaArticle),
		value(Tokens.QueryWikipediaPageviews, queryWikipediaPageviews),

		value(Tokens.Ga4PropertyRepository, ga4PropertyRepo),
		value(Tokens.Ga4DailyMetricRepository, ga4DailyMetricRepo),
		value(Tokens.LinkGa4Property, linkGa4Property),
		value(Tokens.UnlinkGa4Property, unlinkGa4Property),
		value(Tokens.QueryGa4Metrics, queryGa4Metrics),

		value(Tokens.BingPropertyRepository, bingPropertyRepo),
		value(Tokens.BingTrafficObservationRepository, bingTrafficObservationRepo),
		value(Tokens.LinkBingProperty, linkBingProperty),
		value(Tokens.UnlinkBingProperty, unlinkBingProperty),
		value(Tokens.QueryBingTraffic, queryBingTraffic),

		value(Tokens.MonitoredDomainRepository, monitoredDomainRepo),
		value(Tokens.RadarRankSnapshotRepository, radarRankSnapshotRepo),
		value(Tokens.AddMonitoredDomain, addMonitoredDomain),
		value(Tokens.RemoveMonitoredDomain, removeMonitoredDomain),
		value(Tokens.QueryRadarHistory, queryRadarHistory),

		value(Tokens.MetaPixelRepository, metaPixelRepo),
		value(Tokens.MetaAdAccountRepository, metaAdAccountRepo),
		value(Tokens.MetaPixelEventDailyRepository, metaPixelEventDailyRepo),
		value(Tokens.MetaAdsInsightDailyRepository, metaAdsInsightDailyRepo),
		value(Tokens.LinkMetaPixel, linkMetaPixel),
		value(Tokens.UnlinkMetaPixel, unlinkMetaPixel),
		value(Tokens.LinkMetaAdAccount, linkMetaAdAccount),
		value(Tokens.UnlinkMetaAdAccount, unlinkMetaAdAccount),
		value(Tokens.QueryMetaPixelEvents, queryMetaPixelEvents),
		value(Tokens.QueryMetaAdsInsights, queryMetaAdsInsights),

		value(Tokens.ClarityProjectRepository, clarityProjectRepo),
		value(Tokens.ExperienceSnapshotRepository, experienceSnapshotRepo),
		value(Tokens.LinkClarityProject, linkClarityProject),
		value(Tokens.UnlinkClarityProject, unlinkClarityProject),
		value(Tokens.QueryExperienceHistory, queryExperienceHistory),

		value(Tokens.BrandPromptRepository, brandPromptRepo),
		value(Tokens.LlmAnswerRepository, llmAnswerRepo),
		value(Tokens.LlmAnswerReadModel, llmAnswerReadModel),
		value(Tokens.BrandWatchlistResolver, brandWatchlistResolver),
		value(Tokens.MentionExtractor, mentionExtractor),
		value(Tokens.RegisterBrandPrompt, registerBrandPrompt),
		value(Tokens.PauseBrandPrompt, pauseBrandPrompt),
		value(Tokens.ResumeBrandPrompt, resumeBrandPrompt),
		value(Tokens.DeleteBrandPrompt, deleteBrandPrompt),
		value(Tokens.ListBrandPrompts, listBrandPrompts),
		value(Tokens.RecordLlmAnswer, recordLlmAnswer),
		value(Tokens.QueryLlmAnswers, queryLlmAnswers),
		value(Tokens.QueryAiSearchPresence, queryAiSearchPresence),
		value(Tokens.QueryAiSearchSov, queryAiSearchSov),
		value(Tokens.QueryAiSearchCitations, queryAiSearchCitations),
		value(Tokens.QueryPromptSovDaily, queryPromptSovDaily),
		value(Tokens.QueryCompetitiveMatrix, queryCompetitiveMatrix),
		value(Tokens.QueryAiSearchAlerts, queryAiSearchAlerts),
	];

	return {
		providers,
		close: async () => {
			await jobScheduler.close();
			await drizzle.close();
		},
	};
}
