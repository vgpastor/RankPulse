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
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
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
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
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
		const prompt = await this.requirePrompt(principal, projectId, promptId);
		if (body.paused) {
			if (prompt.isActive()) {
				await this.pausePrompt.execute({ brandPromptId: promptId });
			}
		} else {
			if (!prompt.isActive()) {
				await this.resumePrompt.execute({ brandPromptId: promptId });
			}
		}
		const refreshed = await this.promptRepo.findById(promptId as AiSearchInsights.BrandPromptId);
		return {
			brandPromptId: promptId,
			pausedAt: refreshed?.pausedAt?.toISOString() ?? null,
		};
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
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
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

	private async requirePrompt(
		principal: AuthPrincipal,
		projectId: string,
		promptId: string,
	): Promise<AiSearchInsights.BrandPrompt> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		const prompt = await this.promptRepo.findById(promptId as AiSearchInsights.BrandPromptId);
		if (!prompt || prompt.projectId !== project.id) {
			throw new NotFoundError(`BrandPrompt ${promptId} not found in project ${projectId}`);
		}
		return prompt;
	}
}
