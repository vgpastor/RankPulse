import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { ExperienceAnalytics as EXAUseCases } from '@rankpulse/application';
import { ExperienceAnalyticsContracts } from '@rankpulse/contracts';
import type { ExperienceAnalytics, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class ClarityController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.LinkClarityProject) private readonly linkProject: EXAUseCases.LinkClarityProjectUseCase,
		@Inject(Tokens.UnlinkClarityProject)
		private readonly unlinkProject: EXAUseCases.UnlinkClarityProjectUseCase,
		@Inject(Tokens.QueryExperienceHistory)
		private readonly queryHistory: EXAUseCases.QueryExperienceHistoryUseCase,
		@Inject(Tokens.ClarityProjectRepository)
		private readonly projectsRepo: ExperienceAnalytics.ClarityProjectRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/clarity/projects')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<ExperienceAnalyticsContracts.ClarityProjectDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.projectsRepo.listForProject(project.id);
		return list.map((c) => this.serialize(c));
	}

	@Post('projects/:projectId/clarity/projects')
	async link(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(ExperienceAnalyticsContracts.LinkClarityProjectRequest))
		body: ExperienceAnalyticsContracts.LinkClarityProjectRequest,
	): Promise<{ clarityProjectId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.linkProject.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			clarityHandle: body.clarityHandle,
			credentialId: body.credentialId ?? null,
		});
	}

	@Delete('clarity/projects/:clarityProjectId')
	async unlink(
		@Principal() principal: AuthPrincipal,
		@Param('clarityProjectId') clarityProjectId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToClarityProject(principal, clarityProjectId);
		await this.unlinkProject.execute({ clarityProjectId });
		return { ok: true };
	}

	@Get('clarity/projects/:clarityProjectId/history')
	async history(
		@Principal() principal: AuthPrincipal,
		@Param('clarityProjectId') clarityProjectId: string,
		@Query(new ZodValidationPipe(ExperienceAnalyticsContracts.ExperienceHistoryQuery))
		q: ExperienceAnalyticsContracts.ExperienceHistoryQuery,
	): Promise<ExperienceAnalyticsContracts.ExperienceHistoryRowDto[]> {
		await this.requireAccessToClarityProject(principal, clarityProjectId);
		const result = await this.queryHistory.execute({ clarityProjectId, from: q.from, to: q.to });
		return [...result];
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	private async requireAccessToClarityProject(
		principal: AuthPrincipal,
		clarityProjectId: string,
	): Promise<void> {
		// Same IDOR-safe 404-collapse used elsewhere.
		const cp = await this.projectsRepo.findById(clarityProjectId as ExperienceAnalytics.ClarityProjectId);
		if (!cp) throw new NotFoundError(`ClarityProject ${clarityProjectId} not found`);
		const project = await this.projects.findById(cp.projectId);
		if (!project) throw new NotFoundError(`ClarityProject ${clarityProjectId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`ClarityProject ${clarityProjectId} not found`);
			}
			throw err;
		}
	}

	private serialize(c: ExperienceAnalytics.ClarityProject): ExperienceAnalyticsContracts.ClarityProjectDto {
		return {
			id: c.id,
			projectId: c.projectId,
			clarityHandle: c.clarityHandle.value,
			credentialId: c.credentialId,
			linkedAt: c.linkedAt.toISOString(),
			unlinkedAt: c.unlinkedAt ? c.unlinkedAt.toISOString() : null,
			isActive: c.isActive(),
		};
	}
}
