import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { BingWebmasterInsights as BWIUseCases } from '@rankpulse/application';
import { BingWebmasterInsightsContracts } from '@rankpulse/contracts';
import type { BingWebmasterInsights, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class BingController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.LinkBingProperty) private readonly linkProperty: BWIUseCases.LinkBingPropertyUseCase,
		@Inject(Tokens.UnlinkBingProperty) private readonly unlinkProperty: BWIUseCases.UnlinkBingPropertyUseCase,
		@Inject(Tokens.QueryBingTraffic) private readonly queryTraffic: BWIUseCases.QueryBingTrafficUseCase,
		@Inject(Tokens.BingPropertyRepository)
		private readonly properties: BingWebmasterInsights.BingPropertyRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/bing/properties')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<BingWebmasterInsightsContracts.BingPropertyDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.properties.listForProject(project.id);
		return list.map((p) => this.serialize(p));
	}

	@Post('projects/:projectId/bing/properties')
	async link(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(BingWebmasterInsightsContracts.LinkBingPropertyRequest))
		body: BingWebmasterInsightsContracts.LinkBingPropertyRequest,
	): Promise<{ bingPropertyId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.linkProperty.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			siteUrl: body.siteUrl,
			credentialId: body.credentialId ?? null,
		});
	}

	@Delete('bing/properties/:bingPropertyId')
	async unlink(
		@Principal() principal: AuthPrincipal,
		@Param('bingPropertyId') bingPropertyId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToProperty(principal, bingPropertyId);
		await this.unlinkProperty.execute({ bingPropertyId });
		return { ok: true };
	}

	@Get('bing/properties/:bingPropertyId/traffic')
	async traffic(
		@Principal() principal: AuthPrincipal,
		@Param('bingPropertyId') bingPropertyId: string,
		@Query(new ZodValidationPipe(BingWebmasterInsightsContracts.BingTrafficQuery))
		q: BingWebmasterInsightsContracts.BingTrafficQuery,
	): Promise<BingWebmasterInsightsContracts.BingTrafficObservationDto[]> {
		await this.requireAccessToProperty(principal, bingPropertyId);
		const result = await this.queryTraffic.execute({ bingPropertyId, from: q.from, to: q.to });
		return [...result];
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	private async requireAccessToProperty(principal: AuthPrincipal, bingPropertyId: string): Promise<void> {
		// Same IDOR-safe 404-collapse used in web-performance / GA4 / GSC.
		// A leaked id must not leak existence via 403 vs 404.
		const property = await this.properties.findById(bingPropertyId as BingWebmasterInsights.BingPropertyId);
		if (!property) throw new NotFoundError(`Bing property ${bingPropertyId} not found`);
		const project = await this.projects.findById(property.projectId);
		if (!project) throw new NotFoundError(`Bing property ${bingPropertyId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`Bing property ${bingPropertyId} not found`);
			}
			throw err;
		}
	}

	private serialize(p: BingWebmasterInsights.BingProperty): BingWebmasterInsightsContracts.BingPropertyDto {
		return {
			id: p.id,
			projectId: p.projectId,
			siteUrl: p.siteUrl,
			credentialId: p.credentialId,
			linkedAt: p.linkedAt.toISOString(),
			unlinkedAt: p.unlinkedAt ? p.unlinkedAt.toISOString() : null,
			isActive: p.isActive(),
		};
	}
}
