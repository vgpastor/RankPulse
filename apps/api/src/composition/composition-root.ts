import type { Provider, ValueProvider } from '@nestjs/common';
import {
	IdentityAccess as IAUseCases,
	ProviderConnectivity as PCUseCases,
	ProjectManagement as PMUseCases,
	RankTracking as RTUseCases,
	SearchConsoleInsights as SCIUseCases,
} from '@rankpulse/application';
import type { ProjectManagement } from '@rankpulse/domain';
import { Crypto, DrizzlePersistence, Events, Queue as QueueAdapters } from '@rankpulse/infrastructure';
import { ProviderRegistry } from '@rankpulse/provider-core';
import { DataForSeoProvider } from '@rankpulse/provider-dataforseo';
import { GscProvider } from '@rankpulse/provider-gsc';
import { InvalidInputError, SystemClock, SystemIdGenerator } from '@rankpulse/shared';
import { JwtService } from '../common/auth/jwt.service.js';
import type { AppEnv } from '../config/env.js';
import { Tokens } from './tokens.js';

const value = <T>(token: symbol, useValue: T): ValueProvider<T> => ({ provide: token, useValue });

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

	const jobScheduler = new QueueAdapters.BullMqJobScheduler({
		connection: { url: env.REDIS_URL },
	});

	const providerRegistry = new ProviderRegistry();
	providerRegistry.register(new DataForSeoProvider());
	providerRegistry.register(new GscProvider());

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

	// BACKLOG #23 / #21 — auto-schedule daily GSC fetch on property link.
	// Subscribes to the in-memory event bus; the handler is fire-and-forget,
	// errors are swallowed and logged so a scheduler outage doesn't 500 the
	// link API.
	const autoScheduleOnGscLink = new SCIUseCases.AutoScheduleOnGscPropertyLinkedHandler(
		scheduleEndpointFetch,
		{
			info: (meta, msg) => {
				// eslint-disable-next-line no-console
				console.log(`[auto-schedule-on-gsc-link] ${msg}`, meta);
			},
			error: (meta, msg) => {
				// eslint-disable-next-line no-console
				console.error(`[auto-schedule-on-gsc-link] ${msg}`, meta);
			},
		},
	);
	eventPublisher.on('GscPropertyLinked', (event) => {
		void autoScheduleOnGscLink.handle(event);
	});

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
	];

	return {
		providers,
		close: async () => {
			await jobScheduler.close();
			await drizzle.close();
		},
	};
}
