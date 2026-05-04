import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { SearchConsoleInsights as SCIUseCases } from '@rankpulse/application';
import { SearchConsoleInsightsContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

type LinkGscPropertyRequest = SearchConsoleInsightsContracts.LinkGscPropertyRequest;
type GscPropertyDto = SearchConsoleInsightsContracts.GscPropertyDto;
type GscPerformanceQuery = SearchConsoleInsightsContracts.GscPerformanceQuery;

@Controller('gsc')
export class GscController {
	constructor(
		@Inject(Tokens.LinkGscProperty) private readonly linkProperty: SCIUseCases.LinkGscPropertyUseCase,
		@Inject(Tokens.QueryGscPerformance)
		private readonly queryPerformance: SCIUseCases.QueryGscPerformanceUseCase,
		@Inject(Tokens.GscPropertyRepository)
		private readonly propertyRepo: SearchConsoleInsights.GscPropertyRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) private readonly memberships: IdentityAccess.MembershipRepository,
	) {}

	@Post('properties')
	async link(
		@Principal() principal: AuthPrincipal,
		@Body(new ZodValidationPipe(SearchConsoleInsightsContracts.LinkGscPropertyRequest))
		body: LinkGscPropertyRequest,
	): Promise<{ gscPropertyId: string }> {
		const project = await this.projects.findById(body.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${body.projectId} not found`);
		}
		await this.assertMember(principal, project.organizationId);
		return this.linkProperty.execute({
			organizationId: project.organizationId,
			projectId: body.projectId,
			siteUrl: body.siteUrl,
			propertyType: body.propertyType,
			credentialId: body.credentialId ?? null,
		});
	}

	@Get('projects/:projectId/properties')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<GscPropertyDto[]> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.assertMember(principal, project.organizationId);
		const properties = await this.propertyRepo.listForProject(project.id);
		return properties.map(this.toDto);
	}

	@Get('properties/:id/performance')
	async performance(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Query(new ZodValidationPipe(SearchConsoleInsightsContracts.GscPerformanceQuery)) q: GscPerformanceQuery,
	): Promise<SearchConsoleInsightsContracts.GscPerformancePointDto[]> {
		const property = await this.propertyRepo.findById(id as SearchConsoleInsights.GscPropertyId);
		if (!property) {
			throw new NotFoundError(`GSC property ${id} not found`);
		}
		const project = await this.projects.findById(property.projectId);
		if (!project) {
			throw new NotFoundError(`Project ${property.projectId} not found`);
		}
		await this.assertMember(principal, project.organizationId);
		const to = q.to ? new Date(q.to) : new Date();
		const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
		return this.queryPerformance.execute({
			gscPropertyId: id,
			from,
			to,
			query: q.query ?? null,
			page: q.page ?? null,
			country: q.country ?? null,
			device: q.device ?? null,
		});
	}

	private toDto(p: SearchConsoleInsights.GscProperty): GscPropertyDto {
		return {
			id: p.id,
			projectId: p.projectId,
			siteUrl: p.siteUrl,
			propertyType: p.propertyType,
			credentialId: p.credentialId,
			linkedAt: p.linkedAt.toISOString(),
			unlinkedAt: p.unlinkedAt ? p.unlinkedAt.toISOString() : null,
		};
	}

	private async assertMember(principal: AuthPrincipal, orgId: string): Promise<void> {
		const m = await this.memberships.findActiveFor(
			orgId as IdentityAccess.OrganizationId,
			principal.userId as IdentityAccess.UserId,
		);
		if (!m) {
			throw new ForbiddenError('Not a member of this organization');
		}
	}
}
