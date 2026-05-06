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
	CompetitorSuggestionRepository: Symbol('CompetitorSuggestionRepository'),

	// Project-Management use cases
	CreateProject: Symbol('CreateProjectUseCase'),
	AddDomainToProject: Symbol('AddDomainToProjectUseCase'),
	AddProjectLocation: Symbol('AddProjectLocationUseCase'),
	AddCompetitor: Symbol('AddCompetitorUseCase'),
	ImportKeywords: Symbol('ImportKeywordsUseCase'),
	CreatePortfolio: Symbol('CreatePortfolioUseCase'),
	ListPortfolios: Symbol('ListPortfoliosUseCase'),
	GetPortfolio: Symbol('GetPortfolioUseCase'),
	RenamePortfolio: Symbol('RenamePortfolioUseCase'),
	DeletePortfolio: Symbol('DeletePortfolioUseCase'),
	ListCompetitorSuggestions: Symbol('ListCompetitorSuggestionsUseCase'),
	PromoteCompetitorSuggestion: Symbol('PromoteCompetitorSuggestionUseCase'),
	DismissCompetitorSuggestion: Symbol('DismissCompetitorSuggestionUseCase'),

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
	TriggerJobDefinitionRun: Symbol('TriggerJobDefinitionRunUseCase'),
	ListJobDefinitions: Symbol('ListJobDefinitionsUseCase'),
	GetJobDefinition: Symbol('GetJobDefinitionUseCase'),
	UpdateJobDefinition: Symbol('UpdateJobDefinitionUseCase'),
	DeleteJobDefinition: Symbol('DeleteJobDefinitionUseCase'),
	ListJobRuns: Symbol('ListJobRunsUseCase'),
	RecordApiUsage: Symbol('RecordApiUsageUseCase'),

	// Rank-Tracking ports
	TrackedKeywordRepository: Symbol('TrackedKeywordRepository'),
	RankingObservationRepository: Symbol('RankingObservationRepository'),

	// Rank-Tracking use cases
	StartTrackingKeyword: Symbol('StartTrackingKeywordUseCase'),
	RecordRankingObservation: Symbol('RecordRankingObservationUseCase'),
	QueryRankingHistory: Symbol('QueryRankingHistoryUseCase'),

	// Search-Console-Insights ports
	GscPropertyRepository: Symbol('GscPropertyRepository'),
	GscPerformanceObservationRepository: Symbol('GscPerformanceObservationRepository'),

	// Search-Console-Insights use cases
	LinkGscProperty: Symbol('LinkGscPropertyUseCase'),
	IngestGscRows: Symbol('IngestGscRowsUseCase'),
	QueryGscPerformance: Symbol('QueryGscPerformanceUseCase'),

	// Entity-Awareness ports
	WikipediaArticleRepository: Symbol('WikipediaArticleRepository'),
	WikipediaPageviewObservationRepository: Symbol('WikipediaPageviewObservationRepository'),

	// Entity-Awareness use cases
	LinkWikipediaArticle: Symbol('LinkWikipediaArticleUseCase'),
	UnlinkWikipediaArticle: Symbol('UnlinkWikipediaArticleUseCase'),
	QueryWikipediaPageviews: Symbol('QueryWikipediaPageviewsUseCase'),

	// Web-Performance ports
	TrackedPageRepository: Symbol('TrackedPageRepository'),
	PageSpeedSnapshotRepository: Symbol('PageSpeedSnapshotRepository'),

	// Web-Performance use cases
	TrackPage: Symbol('TrackPageUseCase'),
	UntrackPage: Symbol('UntrackPageUseCase'),
	QueryPageSpeedHistory: Symbol('QueryPageSpeedHistoryUseCase'),

	// Traffic-Analytics (GA4) ports
	Ga4PropertyRepository: Symbol('Ga4PropertyRepository'),
	Ga4DailyMetricRepository: Symbol('Ga4DailyMetricRepository'),

	// Traffic-Analytics (GA4) use cases
	LinkGa4Property: Symbol('LinkGa4PropertyUseCase'),
	UnlinkGa4Property: Symbol('UnlinkGa4PropertyUseCase'),
	QueryGa4Metrics: Symbol('QueryGa4MetricsUseCase'),

	// Bing-Webmaster-Insights ports
	BingPropertyRepository: Symbol('BingPropertyRepository'),
	BingTrafficObservationRepository: Symbol('BingTrafficObservationRepository'),

	// Bing-Webmaster-Insights use cases
	LinkBingProperty: Symbol('LinkBingPropertyUseCase'),
	UnlinkBingProperty: Symbol('UnlinkBingPropertyUseCase'),
	QueryBingTraffic: Symbol('QueryBingTrafficUseCase'),

	// Macro-Context (Cloudflare Radar) ports
	MonitoredDomainRepository: Symbol('MonitoredDomainRepository'),
	RadarRankSnapshotRepository: Symbol('RadarRankSnapshotRepository'),

	// Macro-Context use cases
	AddMonitoredDomain: Symbol('AddMonitoredDomainUseCase'),
	RemoveMonitoredDomain: Symbol('RemoveMonitoredDomainUseCase'),
	QueryRadarHistory: Symbol('QueryRadarHistoryUseCase'),

	// Infrastructure handles
	DrizzleClient: Symbol('DrizzleClient'),
	JwtService: Symbol('JwtService'),
	AppEnv: Symbol('AppEnv'),
} as const;

export type TokenName = keyof typeof Tokens;
