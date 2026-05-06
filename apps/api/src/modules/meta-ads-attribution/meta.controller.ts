import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { MetaAdsAttribution as MAAUseCases } from '@rankpulse/application';
import { MetaAdsAttributionContracts } from '@rankpulse/contracts';
import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

@Controller()
export class MetaController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.LinkMetaPixel) private readonly linkPixel: MAAUseCases.LinkMetaPixelUseCase,
		@Inject(Tokens.UnlinkMetaPixel) private readonly unlinkPixel: MAAUseCases.UnlinkMetaPixelUseCase,
		@Inject(Tokens.LinkMetaAdAccount) private readonly linkAccount: MAAUseCases.LinkMetaAdAccountUseCase,
		@Inject(Tokens.UnlinkMetaAdAccount)
		private readonly unlinkAccount: MAAUseCases.UnlinkMetaAdAccountUseCase,
		@Inject(Tokens.QueryMetaPixelEvents)
		private readonly queryPixelEvents: MAAUseCases.QueryMetaPixelEventsUseCase,
		@Inject(Tokens.QueryMetaAdsInsights)
		private readonly queryAdsInsights: MAAUseCases.QueryMetaAdsInsightsUseCase,
		@Inject(Tokens.MetaPixelRepository)
		private readonly pixels: MetaAdsAttribution.MetaPixelRepository,
		@Inject(Tokens.MetaAdAccountRepository)
		private readonly accounts: MetaAdsAttribution.MetaAdAccountRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	// --- Pixels --------------------------------------------------------------

	@Get('projects/:projectId/meta/pixels')
	async listPixels(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<MetaAdsAttributionContracts.MetaPixelDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.pixels.listForProject(project.id);
		return list.map((p) => this.serializePixel(p));
	}

	@Post('projects/:projectId/meta/pixels')
	async linkPixelEndpoint(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(MetaAdsAttributionContracts.LinkMetaPixelRequest))
		body: MetaAdsAttributionContracts.LinkMetaPixelRequest,
	): Promise<{ metaPixelId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.linkPixel.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			pixelHandle: body.pixelHandle,
			credentialId: body.credentialId ?? null,
		});
	}

	@Delete('meta/pixels/:metaPixelId')
	async unlinkPixelEndpoint(
		@Principal() principal: AuthPrincipal,
		@Param('metaPixelId') metaPixelId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToPixel(principal, metaPixelId);
		await this.unlinkPixel.execute({ metaPixelId });
		return { ok: true };
	}

	@Get('meta/pixels/:metaPixelId/events')
	async pixelEvents(
		@Principal() principal: AuthPrincipal,
		@Param('metaPixelId') metaPixelId: string,
		@Query(new ZodValidationPipe(MetaAdsAttributionContracts.MetaPixelEventsHistoryQuery))
		q: MetaAdsAttributionContracts.MetaPixelEventsHistoryQuery,
	): Promise<MetaAdsAttributionContracts.MetaPixelEventDailyDto[]> {
		await this.requireAccessToPixel(principal, metaPixelId);
		const result = await this.queryPixelEvents.execute({ metaPixelId, from: q.from, to: q.to });
		return [...result];
	}

	// --- Ad accounts ---------------------------------------------------------

	@Get('projects/:projectId/meta/ad-accounts')
	async listAccounts(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<MetaAdsAttributionContracts.MetaAdAccountDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.accounts.listForProject(project.id);
		return list.map((a) => this.serializeAccount(a));
	}

	@Post('projects/:projectId/meta/ad-accounts')
	async linkAccountEndpoint(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(MetaAdsAttributionContracts.LinkMetaAdAccountRequest))
		body: MetaAdsAttributionContracts.LinkMetaAdAccountRequest,
	): Promise<{ metaAdAccountId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.linkAccount.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			adAccountHandle: body.adAccountHandle,
			credentialId: body.credentialId ?? null,
		});
	}

	@Delete('meta/ad-accounts/:metaAdAccountId')
	async unlinkAccountEndpoint(
		@Principal() principal: AuthPrincipal,
		@Param('metaAdAccountId') metaAdAccountId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToAccount(principal, metaAdAccountId);
		await this.unlinkAccount.execute({ metaAdAccountId });
		return { ok: true };
	}

	@Get('meta/ad-accounts/:metaAdAccountId/insights')
	async accountInsights(
		@Principal() principal: AuthPrincipal,
		@Param('metaAdAccountId') metaAdAccountId: string,
		@Query(new ZodValidationPipe(MetaAdsAttributionContracts.MetaAdsInsightsHistoryQuery))
		q: MetaAdsAttributionContracts.MetaAdsInsightsHistoryQuery,
	): Promise<MetaAdsAttributionContracts.MetaAdsInsightDailyDto[]> {
		await this.requireAccessToAccount(principal, metaAdAccountId);
		const result = await this.queryAdsInsights.execute({ metaAdAccountId, from: q.from, to: q.to });
		return [...result];
	}

	// --- helpers -------------------------------------------------------------

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	private async requireAccessToPixel(principal: AuthPrincipal, metaPixelId: string): Promise<void> {
		// Collapse 403 to 404 — same IDOR-safe shape used elsewhere.
		const pixel = await this.pixels.findById(metaPixelId as MetaAdsAttribution.MetaPixelId);
		if (!pixel) throw new NotFoundError(`MetaPixel ${metaPixelId} not found`);
		const project = await this.projects.findById(pixel.projectId);
		if (!project) throw new NotFoundError(`MetaPixel ${metaPixelId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`MetaPixel ${metaPixelId} not found`);
			}
			throw err;
		}
	}

	private async requireAccessToAccount(principal: AuthPrincipal, metaAdAccountId: string): Promise<void> {
		const account = await this.accounts.findById(metaAdAccountId as MetaAdsAttribution.MetaAdAccountId);
		if (!account) throw new NotFoundError(`MetaAdAccount ${metaAdAccountId} not found`);
		const project = await this.projects.findById(account.projectId);
		if (!project) throw new NotFoundError(`MetaAdAccount ${metaAdAccountId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`MetaAdAccount ${metaAdAccountId} not found`);
			}
			throw err;
		}
	}

	private serializePixel(p: MetaAdsAttribution.MetaPixel): MetaAdsAttributionContracts.MetaPixelDto {
		return {
			id: p.id,
			projectId: p.projectId,
			pixelHandle: p.handle.value,
			credentialId: p.credentialId,
			linkedAt: p.linkedAt.toISOString(),
			unlinkedAt: p.unlinkedAt ? p.unlinkedAt.toISOString() : null,
			isActive: p.isActive(),
		};
	}

	private serializeAccount(
		a: MetaAdsAttribution.MetaAdAccount,
	): MetaAdsAttributionContracts.MetaAdAccountDto {
		return {
			id: a.id,
			projectId: a.projectId,
			adAccountHandle: a.handle.value,
			credentialId: a.credentialId,
			linkedAt: a.linkedAt.toISOString(),
			unlinkedAt: a.unlinkedAt ? a.unlinkedAt.toISOString() : null,
			isActive: a.isActive(),
		};
	}
}
