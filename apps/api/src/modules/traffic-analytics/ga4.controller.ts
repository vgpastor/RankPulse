import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { TrafficAnalytics as TAUseCases } from '@rankpulse/application';
import { TrafficAnalyticsContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class Ga4Controller {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.LinkGa4Property) private readonly linkProperty: TAUseCases.LinkGa4PropertyUseCase,
		@Inject(Tokens.UnlinkGa4Property) private readonly unlinkProperty: TAUseCases.UnlinkGa4PropertyUseCase,
		@Inject(Tokens.QueryGa4Metrics) private readonly queryMetrics: TAUseCases.QueryGa4MetricsUseCase,
		@Inject(Tokens.Ga4PropertyRepository)
		private readonly properties: TrafficAnalytics.Ga4PropertyRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/ga4/properties')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<TrafficAnalyticsContracts.Ga4PropertyDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.properties.listForProject(project.id);
		return list.map((p) => this.serialize(p));
	}

	@Post('projects/:projectId/ga4/properties')
	async link(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(TrafficAnalyticsContracts.LinkGa4PropertyRequest))
		body: TrafficAnalyticsContracts.LinkGa4PropertyRequest,
	): Promise<{ ga4PropertyId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.linkProperty.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			propertyHandle: body.propertyHandle,
			credentialId: body.credentialId ?? null,
		});
	}

	@Delete('ga4/properties/:ga4PropertyId')
	async unlink(
		@Principal() principal: AuthPrincipal,
		@Param('ga4PropertyId') ga4PropertyId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToProperty(principal, ga4PropertyId);
		await this.unlinkProperty.execute({ ga4PropertyId });
		return { ok: true };
	}

	@Get('ga4/properties/:ga4PropertyId/metrics')
	async metrics(
		@Principal() principal: AuthPrincipal,
		@Param('ga4PropertyId') ga4PropertyId: string,
		@Query(new ZodValidationPipe(TrafficAnalyticsContracts.Ga4MetricsQuery))
		q: TrafficAnalyticsContracts.Ga4MetricsQuery,
	): Promise<TrafficAnalyticsContracts.Ga4DailyMetricDto[]> {
		await this.requireAccessToProperty(principal, ga4PropertyId);
		const result = await this.queryMetrics.execute({ ga4PropertyId, from: q.from, to: q.to });
		return [...result];
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	private async requireAccessToProperty(principal: AuthPrincipal, ga4PropertyId: string): Promise<void> {
		// Collapses NotFound and Forbidden into the same 404 — same IDOR-safe
		// pattern used by the web-performance and entity-awareness controllers.
		// Without this, a leaked property id would let an attacker probe
		// existence by distinguishing 403 from 404.
		const property = await this.properties.findById(ga4PropertyId as TrafficAnalytics.Ga4PropertyId);
		if (!property) throw new NotFoundError(`GA4 property ${ga4PropertyId} not found`);
		const project = await this.projects.findById(property.projectId);
		if (!project) throw new NotFoundError(`GA4 property ${ga4PropertyId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`GA4 property ${ga4PropertyId} not found`);
			}
			throw err;
		}
	}

	private serialize(p: TrafficAnalytics.Ga4Property): TrafficAnalyticsContracts.Ga4PropertyDto {
		return {
			id: p.id,
			projectId: p.projectId,
			propertyHandle: p.propertyHandle.value,
			credentialId: p.credentialId,
			linkedAt: p.linkedAt.toISOString(),
			unlinkedAt: p.unlinkedAt ? p.unlinkedAt.toISOString() : null,
			isActive: p.isActive(),
		};
	}
}
