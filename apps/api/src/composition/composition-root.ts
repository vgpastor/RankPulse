import type { Provider, ValueProvider } from '@nestjs/common';
import { IdentityAccess as IAUseCases, ProjectManagement as PMUseCases } from '@rankpulse/application';
import { Crypto, DrizzlePersistence, Events } from '@rankpulse/infrastructure';
import { SystemClock, SystemIdGenerator } from '@rankpulse/shared';
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
		value(Tokens.RegisterOrganization, registerOrganization),
		value(Tokens.AuthenticateUser, authenticateUser),
		value(Tokens.InviteUser, inviteUser),
		value(Tokens.IssueApiToken, issueApiToken),
		value(Tokens.CreateProject, createProject),
		value(Tokens.AddDomainToProject, addDomain),
		value(Tokens.AddProjectLocation, addLocation),
		value(Tokens.AddCompetitor, addCompetitor),
		value(Tokens.ImportKeywords, importKeywords),
	];

	return {
		providers,
		close: () => drizzle.close(),
	};
}
