import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import type { CompetitorIntelligence as CIUseCases } from '@rankpulse/application';
import { CompetitorIntelligenceContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class CompetitorIntelligenceController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.QueryKeywordGaps)
		private readonly queryKeywordGaps: CIUseCases.QueryKeywordGapsUseCase,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/keyword-gaps')
	async keywordGaps(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Query(new ZodValidationPipe(CompetitorIntelligenceContracts.KeywordGapsQuery))
		q: CompetitorIntelligenceContracts.KeywordGapsQuery,
	): Promise<CompetitorIntelligenceContracts.KeywordGapsResponse> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return this.queryKeywordGaps.execute({
			projectId,
			ourDomain: q.ourDomain,
			competitorDomain: q.competitorDomain,
			limit: q.limit,
			minVolume: q.minVolume,
		});
	}
}
