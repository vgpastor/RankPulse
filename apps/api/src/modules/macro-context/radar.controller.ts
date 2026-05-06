import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { MacroContext as MCUseCases } from '@rankpulse/application';
import { MacroContextContracts } from '@rankpulse/contracts';
import type { IdentityAccess, MacroContext, ProjectManagement } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class RadarController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.AddMonitoredDomain) private readonly addDomain: MCUseCases.AddMonitoredDomainUseCase,
		@Inject(Tokens.RemoveMonitoredDomain)
		private readonly removeDomain: MCUseCases.RemoveMonitoredDomainUseCase,
		@Inject(Tokens.QueryRadarHistory) private readonly queryHistory: MCUseCases.QueryRadarHistoryUseCase,
		@Inject(Tokens.MonitoredDomainRepository)
		private readonly domains: MacroContext.MonitoredDomainRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/radar/domains')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<MacroContextContracts.MonitoredDomainDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.domains.listForProject(project.id);
		return list.map((d) => this.serialize(d));
	}

	@Post('projects/:projectId/radar/domains')
	async add(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(MacroContextContracts.AddMonitoredDomainRequest))
		body: MacroContextContracts.AddMonitoredDomainRequest,
	): Promise<{ monitoredDomainId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.addDomain.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			domain: body.domain,
			credentialId: body.credentialId ?? null,
		});
	}

	@Delete('radar/domains/:monitoredDomainId')
	async remove(
		@Principal() principal: AuthPrincipal,
		@Param('monitoredDomainId') monitoredDomainId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToDomain(principal, monitoredDomainId);
		await this.removeDomain.execute({ monitoredDomainId });
		return { ok: true };
	}

	@Get('radar/domains/:monitoredDomainId/history')
	async history(
		@Principal() principal: AuthPrincipal,
		@Param('monitoredDomainId') monitoredDomainId: string,
		@Query(new ZodValidationPipe(MacroContextContracts.RadarHistoryQuery))
		q: MacroContextContracts.RadarHistoryQuery,
	): Promise<MacroContextContracts.RadarHistoryRowDto[]> {
		await this.requireAccessToDomain(principal, monitoredDomainId);
		const result = await this.queryHistory.execute({ monitoredDomainId, from: q.from, to: q.to });
		return [...result];
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	private async requireAccessToDomain(principal: AuthPrincipal, monitoredDomainId: string): Promise<void> {
		// Same IDOR-safe 404-collapse used elsewhere — leaked id must not
		// distinguish 403 from 404 on the wire.
		const md = await this.domains.findById(monitoredDomainId as MacroContext.MonitoredDomainId);
		if (!md) throw new NotFoundError(`MonitoredDomain ${monitoredDomainId} not found`);
		const project = await this.projects.findById(md.projectId);
		if (!project) throw new NotFoundError(`MonitoredDomain ${monitoredDomainId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`MonitoredDomain ${monitoredDomainId} not found`);
			}
			throw err;
		}
	}

	private serialize(d: MacroContext.MonitoredDomain): MacroContextContracts.MonitoredDomainDto {
		return {
			id: d.id,
			projectId: d.projectId,
			domain: d.domain.value,
			credentialId: d.credentialId,
			addedAt: d.addedAt.toISOString(),
			removedAt: d.removedAt ? d.removedAt.toISOString() : null,
			isActive: d.isActive(),
		};
	}
}
