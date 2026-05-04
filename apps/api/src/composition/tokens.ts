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

	// Infrastructure handles
	DrizzleClient: Symbol('DrizzleClient'),
	JwtService: Symbol('JwtService'),
	AppEnv: Symbol('AppEnv'),
} as const;

export type TokenName = keyof typeof Tokens;
