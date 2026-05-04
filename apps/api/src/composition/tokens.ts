/**
 * DI tokens used to inject domain ports and application use cases into NestJS
 * controllers without leaking framework concerns into application/domain
 * layers. The composition root binds each token to a concrete adapter or
 * use case instance.
 */
export const Tokens = {
	// Shared
	Clock: Symbol('Clock'),
	IdGenerator: Symbol('IdGenerator'),
	EventPublisher: Symbol('EventPublisher'),

	// Identity-Access ports
	OrganizationRepository: Symbol('OrganizationRepository'),
	UserRepository: Symbol('UserRepository'),
	MembershipRepository: Symbol('MembershipRepository'),
	ApiTokenRepository: Symbol('ApiTokenRepository'),
	PasswordHasher: Symbol('PasswordHasher'),
	ApiTokenGenerator: Symbol('ApiTokenGenerator'),

	// Identity-Access use cases
	RegisterOrganization: Symbol('RegisterOrganizationUseCase'),
	AuthenticateUser: Symbol('AuthenticateUserUseCase'),
	InviteUser: Symbol('InviteUserUseCase'),
	IssueApiToken: Symbol('IssueApiTokenUseCase'),

	// Project-Management ports
	PortfolioRepository: Symbol('PortfolioRepository'),
	ProjectRepository: Symbol('ProjectRepository'),
	KeywordListRepository: Symbol('KeywordListRepository'),
	CompetitorRepository: Symbol('CompetitorRepository'),

	// Project-Management use cases
	CreateProject: Symbol('CreateProjectUseCase'),
	AddDomainToProject: Symbol('AddDomainToProjectUseCase'),
	AddProjectLocation: Symbol('AddProjectLocationUseCase'),
	AddCompetitor: Symbol('AddCompetitorUseCase'),
	ImportKeywords: Symbol('ImportKeywordsUseCase'),

	// Provider-Connectivity ports
	CredentialRepository: Symbol('CredentialRepository'),
	JobDefinitionRepository: Symbol('JobDefinitionRepository'),
	JobRunRepository: Symbol('JobRunRepository'),
	RawPayloadRepository: Symbol('RawPayloadRepository'),
	ApiUsageRepository: Symbol('ApiUsageRepository'),
	CredentialVault: Symbol('CredentialVault'),
	JobScheduler: Symbol('JobScheduler'),
	ProviderRegistry: Symbol('ProviderRegistry'),

	// Provider-Connectivity use cases
	RegisterProviderCredential: Symbol('RegisterProviderCredentialUseCase'),
	ResolveProviderCredential: Symbol('ResolveProviderCredentialUseCase'),
	ScheduleEndpointFetch: Symbol('ScheduleEndpointFetchUseCase'),
	RecordApiUsage: Symbol('RecordApiUsageUseCase'),

	// Rank-Tracking ports
	TrackedKeywordRepository: Symbol('TrackedKeywordRepository'),
	RankingObservationRepository: Symbol('RankingObservationRepository'),

	// Rank-Tracking use cases
	StartTrackingKeyword: Symbol('StartTrackingKeywordUseCase'),
	RecordRankingObservation: Symbol('RecordRankingObservationUseCase'),
	QueryRankingHistory: Symbol('QueryRankingHistoryUseCase'),

	// Infrastructure handles
	DrizzleClient: Symbol('DrizzleClient'),
	JwtService: Symbol('JwtService'),
	AppEnv: Symbol('AppEnv'),
} as const;

export type TokenName = keyof typeof Tokens;
