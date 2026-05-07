import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { AiSearchInsights as AiUseCases } from '@rankpulse/application';
import { AiSearchInsightsContracts } from '@rankpulse/contracts';
import type { AiSearchInsights, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

type RegisterBrandPromptRequest = AiSearchInsightsContracts.RegisterBrandPromptRequest;
type RegisterBrandPromptResponse = AiSearchInsightsContracts.RegisterBrandPromptResponse;
type ListBrandPromptsResponse = AiSearchInsightsContracts.ListBrandPromptsResponse;
type ListLlmAnswersQuery = AiSearchInsightsContracts.ListLlmAnswersQuery;
type ListLlmAnswersResponse = AiSearchInsightsContracts.ListLlmAnswersResponse;

@Controller()
export class AiSearchInsightsController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.RegisterBrandPrompt)
		private readonly registerPrompt: AiUseCases.RegisterBrandPromptUseCase,
		@Inject(Tokens.PauseBrandPrompt)
		private readonly pausePrompt: AiUseCases.PauseBrandPromptUseCase,
		@Inject(Tokens.ResumeBrandPrompt)
		private readonly resumePrompt: AiUseCases.ResumeBrandPromptUseCase,
		@Inject(Tokens.DeleteBrandPrompt)
		private readonly deletePrompt: AiUseCases.DeleteBrandPromptUseCase,
		@Inject(Tokens.ListBrandPrompts)
		private readonly listPrompts: AiUseCases.ListBrandPromptsUseCase,
		@Inject(Tokens.QueryLlmAnswers)
		private readonly queryAnswers: AiUseCases.QueryLlmAnswersUseCase,
		@Inject(Tokens.QueryAiSearchPresence)
		private readonly queryPresence: AiUseCases.QueryAiSearchPresenceUseCase,
		@Inject(Tokens.QueryAiSearchSov)
		private readonly querySov: AiUseCases.QueryAiSearchSovUseCase,
		@Inject(Tokens.QueryAiSearchCitations)
		private readonly queryCitations: AiUseCases.QueryAiSearchCitationsUseCase,
		@Inject(Tokens.QueryPromptSovDaily)
		private readonly querySovDaily: AiUseCases.QueryPromptSovDailyUseCase,
		@Inject(Tokens.QueryCompetitiveMatrix)
		private readonly queryMatrix: AiUseCases.QueryCompetitiveMatrixUseCase,
		@Inject(Tokens.QueryAiSearchAlerts)
		private readonly queryAlerts: AiUseCases.QueryAiSearchAlertsUseCase,
		@Inject(Tokens.BrandPromptRepository)
		private readonly promptRepo: AiSearchInsights.BrandPromptRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Post('projects/:projectId/brand-prompts')
	async create(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(AiSearchInsightsContracts.RegisterBrandPromptRequest))
		body: RegisterBrandPromptRequest,
	): Promise<RegisterBrandPromptResponse> {
		const project = await this.requireProjectAccess(principal, projectId);
		const result = await this.registerPrompt.execute({
			organizationId: project.organizationId,
			projectId,
			text: body.text,
			kind: body.kind,
		});
		return { brandPromptId: result.brandPromptId };
	}

	@Get('projects/:projectId/brand-prompts')
	async list(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<ListBrandPromptsResponse> {
		await this.requireProjectAccess(principal, projectId);
		const items = await this.listPrompts.execute({ projectId });
		return { items: items.map((i) => ({ ...i })) };
	}

	@Patch('projects/:projectId/brand-prompts/:promptId')
	async pauseOrResume(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Param('promptId') promptId: string,
		@Body(new ZodValidationPipe(AiSearchInsightsContracts.PauseBrandPromptRequest))
		body: AiSearchInsightsContracts.PauseBrandPromptRequest,
	): Promise<{ brandPromptId: string; pausedAt: string | null }> {
		await this.requirePrompt(principal, projectId, promptId);
		const result = body.paused
			? await this.pausePrompt.execute({ brandPromptId: promptId })
			: await this.resumePrompt.execute({ brandPromptId: promptId });
		return result;
	}

	@Delete('projects/:projectId/brand-prompts/:promptId')
	@HttpCode(204)
	async delete(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Param('promptId') promptId: string,
	): Promise<void> {
		await this.requirePrompt(principal, projectId, promptId);
		await this.deletePrompt.execute({ brandPromptId: promptId });
	}

	@Get('projects/:projectId/brand-prompts/:promptId/answers')
	@SkipThrottle({ default: true, auth: true })
	@Throttle({ bulk: { ttl: 60_000, limit: 600 } })
	async listAnswersForPrompt(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Param('promptId') promptId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.ListLlmAnswersQuery))
		query: ListLlmAnswersQuery,
	): Promise<ListLlmAnswersResponse> {
		await this.requirePrompt(principal, projectId, promptId);
		const items = await this.queryAnswers.execute({
			projectId,
			brandPromptId: promptId,
			aiProvider: query.aiProvider,
			country: query.country,
			language: query.language,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
			limit: query.limit,
		});
		return { items: items.map((i) => ({ ...i, mentions: [...i.mentions], citations: [...i.citations] })) };
	}

	@Get('projects/:projectId/ai-search/answers')
	async listAnswersForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.ListLlmAnswersQuery))
		query: ListLlmAnswersQuery,
	): Promise<ListLlmAnswersResponse> {
		await this.requireProjectAccess(principal, projectId);
		const items = await this.queryAnswers.execute({
			projectId,
			brandPromptId: query.brandPromptId,
			aiProvider: query.aiProvider,
			country: query.country,
			language: query.language,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
			limit: query.limit,
		});
		return { items: items.map((i) => ({ ...i, mentions: [...i.mentions], citations: [...i.citations] })) };
	}

	@Get('projects/:projectId/ai-search/presence')
	async presence(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.AiSearchPresenceQuery))
		query: AiSearchInsightsContracts.AiSearchPresenceQuery,
	): Promise<AiSearchInsightsContracts.AiSearchPresenceResponse> {
		await this.requireProjectAccess(principal, projectId);
		return this.queryPresence.execute({
			projectId,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
		});
	}

	@Get('projects/:projectId/ai-search/sov')
	async sov(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.AiSearchSovQuery))
		query: AiSearchInsightsContracts.AiSearchSovQuery,
	): Promise<AiSearchInsightsContracts.AiSearchSovResponse> {
		await this.requireProjectAccess(principal, projectId);
		const items = await this.querySov.execute({
			projectId,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
		});
		return { items: items.map((i) => ({ ...i })) };
	}

	@Get('projects/:projectId/ai-search/citations')
	async citations(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.AiSearchCitationsQuery))
		query: AiSearchInsightsContracts.AiSearchCitationsQuery,
	): Promise<AiSearchInsightsContracts.AiSearchCitationsResponse> {
		await this.requireProjectAccess(principal, projectId);
		const items = await this.queryCitations.execute({
			projectId,
			onlyOwnDomains: query.onlyOwnDomains,
			aiProvider: query.aiProvider,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
		});
		return { items: items.map((i) => ({ ...i, providers: [...i.providers] })) };
	}

	@Get('projects/:projectId/ai-search/matrix')
	async competitiveMatrix(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.CompetitiveMatrixQuery))
		query: AiSearchInsightsContracts.CompetitiveMatrixQuery,
	): Promise<AiSearchInsightsContracts.CompetitiveMatrixResponse> {
		await this.requireProjectAccess(principal, projectId);
		const items = await this.queryMatrix.execute({
			projectId,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
		});
		return { items: items.map((i) => ({ ...i })) };
	}

	@Get('projects/:projectId/ai-search/alerts')
	async alerts(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<AiSearchInsightsContracts.AiSearchAlertsResponse> {
		await this.requireProjectAccess(principal, projectId);
		const items = await this.queryAlerts.execute({ projectId });
		return { items: items.map((i) => ({ ...i, details: { ...i.details } })) };
	}

	@Get('projects/:projectId/brand-prompts/:promptId/sov-daily')
	async promptSovDaily(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Param('promptId') promptId: string,
		@Query(new ZodValidationPipe(AiSearchInsightsContracts.AiSearchSovDailyQuery))
		query: AiSearchInsightsContracts.AiSearchSovDailyQuery,
	): Promise<AiSearchInsightsContracts.AiSearchSovDailyResponse> {
		await this.requirePrompt(principal, projectId, promptId);
		const items = await this.querySovDaily.execute({
			brandPromptId: promptId,
			from: query.from ? new Date(query.from) : undefined,
			to: query.to ? new Date(query.to) : undefined,
		});
		return { items: items.map((i) => ({ ...i })) };
	}

	private async requireProjectAccess(
		principal: AuthPrincipal,
		projectId: string,
	): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return project;
	}

	private async requirePrompt(
		principal: AuthPrincipal,
		projectId: string,
		promptId: string,
	): Promise<AiSearchInsights.BrandPrompt> {
		const project = await this.requireProjectAccess(principal, projectId);
		const prompt = await this.promptRepo.findById(promptId as AiSearchInsights.BrandPromptId);
		if (!prompt || prompt.projectId !== project.id) {
			throw new NotFoundError(`BrandPrompt ${promptId} not found in project ${projectId}`);
		}
		return prompt;
	}
}
