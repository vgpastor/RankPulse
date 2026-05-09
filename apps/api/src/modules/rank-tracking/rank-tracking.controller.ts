import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { ProviderConnectivity as PCUseCases, RankTracking as RTUseCases } from '@rankpulse/application';
import { RankTrackingContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

type StartTrackingKeywordRequest = RankTrackingContracts.StartTrackingKeywordRequest;
type StartTrackingKeywordResponse = RankTrackingContracts.StartTrackingKeywordResponse;

@Controller()
export class RankTrackingController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.StartTrackingKeyword)
		private readonly startTracking: RTUseCases.StartTrackingKeywordUseCase,
		@Inject(Tokens.ScheduleEndpointFetch)
		private readonly scheduleEndpoint: PCUseCases.ScheduleEndpointFetchUseCase,
		@Inject(Tokens.QueryRankingHistory) private readonly queryHistory: RTUseCases.QueryRankingHistoryUseCase,
		@Inject(Tokens.QuerySerpMap) private readonly querySerpMap: RTUseCases.QuerySerpMapUseCase,
		@Inject(Tokens.QuerySerpCompetitorSuggestions)
		private readonly querySerpSuggestions: RTUseCases.QuerySerpCompetitorSuggestionsUseCase,
		@Inject(Tokens.QueryRankedKeywords)
		private readonly queryRankedKeywords: RTUseCases.QueryRankedKeywordsUseCase,
		@Inject(Tokens.TrackedKeywordRepository)
		private readonly trackedRepo: RankTracking.TrackedKeywordRepository,
		@Inject(Tokens.RankingObservationRepository)
		private readonly obsRepo: RankTracking.RankingObservationRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Post('rank-tracking/keywords')
	@SkipThrottle({ default: true, auth: true })
	@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
	async start(
		@Principal() principal: AuthPrincipal,
		@Body(new ZodValidationPipe(RankTrackingContracts.StartTrackingKeywordRequest))
		body: StartTrackingKeywordRequest,
	): Promise<StartTrackingKeywordResponse> {
		const project = await this.projects.findById(body.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${body.projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		const { trackedKeywordId } = await this.startTracking.execute({
			organizationId: project.organizationId,
			projectId: body.projectId,
			domain: body.domain,
			phrase: body.phrase,
			country: body.country,
			language: body.language,
			device: body.device,
		});

		// BACKLOG #9 opción A + #15: with `autoSchedule` present, wire ONE
		// JobDefinition per (project, phrase, country, language, device).
		// The processor reads tracked_keywords matching that query and fans
		// the SERP payload into N observations — so additional
		// StartTrackingKeyword calls for new domains under the same query
		// just add tracked_keyword rows, not new SERP fetches. 5× cheaper
		// when a project tracks multiple domains for the same keyword.
		//
		// The two operations are NOT transactional — they live in different
		// bounded contexts. On partial failure the caller can fall back to
		// `POST /providers/.../schedule` with the same systemParams shape.
		let scheduledDefinitionId: string | null = null;
		if (body.autoSchedule) {
			const result = await this.scheduleEndpoint.execute({
				projectId: body.projectId,
				providerId: body.autoSchedule.providerId,
				endpointId: body.autoSchedule.endpointId,
				params: body.autoSchedule.params,
				systemParams: {
					organizationId: project.organizationId,
					projectId: body.projectId,
					phrase: body.phrase,
					country: body.country,
					language: body.language,
					device: body.device ?? 'desktop',
				},
				cron: body.autoSchedule.cron,
				credentialOverrideId: body.autoSchedule.credentialOverrideId ?? null,
			});
			scheduledDefinitionId = result.definitionId;
		}

		return { trackedKeywordId, scheduledDefinitionId };
	}

	@Get('projects/:projectId/rankings')
	async listProjectRankings(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<unknown[]> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		const observations = await this.obsRepo.listLatestForProject(project.id);
		return observations.map((o) => ({
			trackedKeywordId: o.trackedKeywordId,
			phrase: o.phrase,
			domain: o.domain,
			country: o.country,
			language: o.language,
			device: o.device,
			position: o.position.value,
			url: o.url,
			observedAt: o.observedAt.toISOString(),
		}));
	}

	@Get('rank-tracking/keywords/:id/history')
	async history(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Query(new ZodValidationPipe(RankTrackingContracts.RankingHistoryQuery))
		q: RankTrackingContracts.RankingHistoryQuery,
	): Promise<RankTrackingContracts.RankingHistoryEntryDto[]> {
		const tracked = await this.trackedRepo.findById(id as RankTracking.TrackedKeywordId);
		if (!tracked) {
			throw new NotFoundError(`Tracked keyword ${id} not found`);
		}
		const project = await this.projects.findById(tracked.projectId);
		if (!project) {
			throw new NotFoundError(`Project ${tracked.projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		const to = q.to ? new Date(q.to) : new Date();
		const from = q.from ? new Date(q.from) : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
		return this.queryHistory.execute({ trackedKeywordId: id, from, to });
	}

	@Get('projects/:projectId/serp-map')
	async serpMap(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(RankTrackingContracts.SerpMapQuery))
		q: RankTrackingContracts.SerpMapQuery,
	): Promise<RankTrackingContracts.SerpMapResponse> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return this.querySerpMap.execute({
			projectId,
			phrase: q.phrase,
			country: q.country,
			language: q.language,
			windowDays: q.windowDays,
		});
	}

	@Get('projects/:projectId/ranked-keywords')
	async rankedKeywords(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(RankTrackingContracts.RankedKeywordsQuery))
		q: RankTrackingContracts.RankedKeywordsQuery,
	): Promise<RankTrackingContracts.RankedKeywordsResponse> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return this.queryRankedKeywords.execute({
			projectId,
			targetDomain: q.targetDomain,
			limit: q.limit,
			minVolume: q.minVolume,
		});
	}

	@Get('projects/:projectId/serp-map/suggestions')
	async serpMapSuggestions(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(RankTrackingContracts.SerpCompetitorSuggestionsQuery))
		q: RankTrackingContracts.SerpCompetitorSuggestionsQuery,
	): Promise<RankTrackingContracts.SerpCompetitorSuggestionsResponse> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return this.querySerpSuggestions.execute({
			projectId,
			minDistinctKeywords: q.minDistinctKeywords,
			windowDays: q.windowDays,
		});
	}
}
