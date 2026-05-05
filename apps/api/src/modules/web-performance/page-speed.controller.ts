import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { WebPerformance as WPUseCases } from '@rankpulse/application';
import { WebPerformanceContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class PageSpeedController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.TrackPage) private readonly trackPage: WPUseCases.TrackPageUseCase,
		@Inject(Tokens.UntrackPage) private readonly untrackPage: WPUseCases.UntrackPageUseCase,
		@Inject(Tokens.QueryPageSpeedHistory)
		private readonly queryHistory: WPUseCases.QueryPageSpeedHistoryUseCase,
		@Inject(Tokens.TrackedPageRepository)
		private readonly trackedPages: WebPerformance.TrackedPageRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/page-speed/pages')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<WebPerformanceContracts.TrackedPageDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.trackedPages.listForProject(project.id);
		return list.map((p) => this.serialize(p));
	}

	@Post('projects/:projectId/page-speed/pages')
	async track(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(WebPerformanceContracts.TrackPageRequest))
		body: WebPerformanceContracts.TrackPageRequest,
	): Promise<{ trackedPageId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.trackPage.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			url: body.url,
			strategy: body.strategy,
		});
	}

	@Delete('page-speed/pages/:trackedPageId')
	async untrack(
		@Principal() principal: AuthPrincipal,
		@Param('trackedPageId') trackedPageId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToPage(principal, trackedPageId);
		await this.untrackPage.execute(trackedPageId);
		return { ok: true };
	}

	@Get('page-speed/pages/:trackedPageId/history')
	async history(
		@Principal() principal: AuthPrincipal,
		@Param('trackedPageId') trackedPageId: string,
		@Query(new ZodValidationPipe(WebPerformanceContracts.PageSpeedHistoryQuery))
		q: WebPerformanceContracts.PageSpeedHistoryQuery,
	): Promise<WebPerformanceContracts.PageSpeedSnapshotDto[]> {
		await this.requireAccessToPage(principal, trackedPageId);
		const to = q.to ? new Date(q.to) : new Date();
		const from = q.from ? new Date(q.from) : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
		const result = await this.queryHistory.execute({ trackedPageId, from, to });
		return [...result];
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	private async requireAccessToPage(principal: AuthPrincipal, trackedPageId: string): Promise<void> {
		const page = await this.trackedPages.findById(trackedPageId as WebPerformance.TrackedPageId);
		if (!page) throw new NotFoundError(`Tracked page ${trackedPageId} not found`);
		const project = await this.projects.findById(page.projectId);
		if (!project) throw new NotFoundError(`Tracked page ${trackedPageId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`Tracked page ${trackedPageId} not found`);
			}
			throw err;
		}
	}

	private serialize(p: WebPerformance.TrackedPage): WebPerformanceContracts.TrackedPageDto {
		return {
			id: p.id,
			projectId: p.projectId,
			url: p.url.value,
			strategy: p.strategy,
			addedAt: p.addedAt.toISOString(),
		};
	}
}
