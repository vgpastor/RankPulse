import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import type {
	ProjectManagement as PMUseCases,
	RankTracking as RTUseCases,
	SearchConsoleInsights as SCIUseCases,
} from '@rankpulse/application';
import {
	ProjectManagementContracts,
	RankTrackingContracts,
	SearchConsoleInsightsContracts,
} from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

/**
 * Decision Cockpit endpoints (issue #117 Sprint 1). All four widgets share
 * the `(projectId)` boundary and are read-only — no domain mutations, no
 * write tokens. Each delegates to its dedicated use case which owns the
 * read-model query + scoring logic.
 *
 * Routed under `projects/:projectId/cockpit/<widget>` rather than under
 * `gsc/...` because the widgets compose data from multiple contexts
 * (today GSC; later rank-tracking, GA4, etc.) and the SPA fetches them
 * together.
 */
@Controller('projects/:projectId/cockpit')
export class CockpitController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.QueryCtrAnomalies)
		private readonly queryCtrAnomalies: SCIUseCases.QueryCtrAnomaliesUseCase,
		@Inject(Tokens.QueryLostOpportunity)
		private readonly queryLostOpportunity: SCIUseCases.QueryLostOpportunityUseCase,
		@Inject(Tokens.QueryQuickWinRoi)
		private readonly queryQuickWinRoi: SCIUseCases.QueryQuickWinRoiUseCase,
		@Inject(Tokens.QueryBrandDecay)
		private readonly queryBrandDecay: SCIUseCases.QueryBrandDecayUseCase,
		@Inject(Tokens.QueryCompetitorActivity)
		private readonly queryCompetitorActivity: PMUseCases.QueryCompetitorActivityUseCase,
		@Inject(Tokens.QuerySearchDemandTrend)
		private readonly querySearchDemandTrend: RTUseCases.QuerySearchDemandTrendUseCase,
		@Inject(Tokens.QueryClicksForecast)
		private readonly queryClicksForecast: SCIUseCases.QueryClicksForecastUseCase,
		@Inject(Tokens.ProjectRepository)
		private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('ctr-anomalies')
	async ctrAnomalies(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(SearchConsoleInsightsContracts.CtrAnomaliesQuery))
		q: SearchConsoleInsightsContracts.CtrAnomaliesQuery,
	): Promise<SearchConsoleInsightsContracts.CtrAnomaliesResponse> {
		await this.requireMembership(principal, projectId);
		return this.queryCtrAnomalies.execute({
			projectId,
			windowDays: q.windowDays,
			minImpressions: q.minImpressions,
		});
	}

	@Get('lost-opportunity')
	async lostOpportunity(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(SearchConsoleInsightsContracts.LostOpportunityQuery))
		q: SearchConsoleInsightsContracts.LostOpportunityQuery,
	): Promise<SearchConsoleInsightsContracts.LostOpportunityResponse> {
		await this.requireMembership(principal, projectId);
		return this.queryLostOpportunity.execute({
			projectId,
			windowDays: q.windowDays,
			minImpressions: q.minImpressions,
			targetPosition: q.targetPosition,
			limit: q.limit,
		});
	}

	@Get('quick-win-roi')
	async quickWinRoi(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(SearchConsoleInsightsContracts.QuickWinRoiQuery))
		q: SearchConsoleInsightsContracts.QuickWinRoiQuery,
	): Promise<SearchConsoleInsightsContracts.QuickWinRoiResponse> {
		await this.requireMembership(principal, projectId);
		return this.queryQuickWinRoi.execute({
			projectId,
			windowDays: q.windowDays,
			minImpressions: q.minImpressions,
			limit: q.limit,
		});
	}

	@Get('brand-decay')
	async brandDecay(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(SearchConsoleInsightsContracts.BrandDecayQuery))
		q: SearchConsoleInsightsContracts.BrandDecayQuery,
	): Promise<SearchConsoleInsightsContracts.BrandDecayResponse> {
		await this.requireMembership(principal, projectId);
		return this.queryBrandDecay.execute({
			projectId,
			windowDays: q.windowDays,
			dropAlertPct: q.dropAlertPct,
		});
	}

	@Get('competitor-activity')
	async competitorActivity(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(ProjectManagementContracts.CompetitorActivityQuery))
		q: ProjectManagementContracts.CompetitorActivityQuery,
	): Promise<ProjectManagementContracts.CompetitorActivityResponse> {
		await this.requireMembership(principal, projectId);
		return this.queryCompetitorActivity.execute({
			projectId,
			windowDays: q.windowDays,
		});
	}

	@Get('search-demand-trend')
	async searchDemandTrend(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(RankTrackingContracts.SearchDemandTrendQuery))
		q: RankTrackingContracts.SearchDemandTrendQuery,
	): Promise<RankTrackingContracts.SearchDemandTrendResponse> {
		await this.requireMembership(principal, projectId);
		return this.querySearchDemandTrend.execute({
			projectId,
			months: q.months,
			targetDomain: q.targetDomain,
		});
	}

	@Get('forecast-90d')
	async forecast90d(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(SearchConsoleInsightsContracts.ClicksForecastQuery))
		q: SearchConsoleInsightsContracts.ClicksForecastQuery,
	): Promise<SearchConsoleInsightsContracts.ClicksForecastResponse> {
		await this.requireMembership(principal, projectId);
		return this.queryClicksForecast.execute({
			projectId,
			historyDays: q.historyDays,
			forecastDays: q.forecastDays,
		});
	}

	private async requireMembership(principal: AuthPrincipal, projectId: string): Promise<void> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
	}
}
