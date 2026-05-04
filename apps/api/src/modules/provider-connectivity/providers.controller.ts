import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { ProviderConnectivity as PCUseCases } from '@rankpulse/application';
import { ProviderConnectivityContracts } from '@rankpulse/contracts';
import { IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

type RegisterCredentialRequest = ProviderConnectivityContracts.RegisterCredentialRequest;
type ScheduleEndpointRequest = ProviderConnectivityContracts.ScheduleEndpointRequest;
type ProviderDto = ProviderConnectivityContracts.ProviderDto;

@Controller('providers')
export class ProvidersController {
	constructor(
		@Inject(Tokens.ProviderRegistry) private readonly registry: ProviderRegistry,
		@Inject(Tokens.RegisterProviderCredential)
		private readonly registerCred: PCUseCases.RegisterProviderCredentialUseCase,
		@Inject(Tokens.ScheduleEndpointFetch) private readonly schedule: PCUseCases.ScheduleEndpointFetchUseCase,
		@Inject(Tokens.MembershipRepository) private readonly memberships: IdentityAccess.MembershipRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
	) {}

	@Get()
	listProviders(): ProviderDto[] {
		return this.registry.list().map((p) => ({
			id: p.id.value,
			displayName: p.displayName,
			authStrategy: p.authStrategy,
			endpoints: p.discover().map((e) => ({
				id: e.id,
				category: e.category,
				displayName: e.displayName,
				description: e.description,
				defaultCron: e.defaultCron,
				cost: e.cost,
				rateLimit: e.rateLimit,
			})),
		}));
	}

	@Get(':providerId/endpoints')
	listEndpoints(@Param('providerId') providerId: string): ProviderDto['endpoints'] {
		const provider = this.registry.get(providerId);
		return provider.discover().map((e) => ({
			id: e.id,
			category: e.category,
			displayName: e.displayName,
			description: e.description,
			defaultCron: e.defaultCron,
			cost: e.cost,
			rateLimit: e.rateLimit,
		}));
	}

	@Post(':providerId/credentials')
	async addCredential(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Body(new ZodValidationPipe(ProviderConnectivityContracts.RegisterCredentialRequest))
		body: RegisterCredentialRequest,
	): Promise<{ credentialId: string; lastFour: string }> {
		await this.assertAdmin(principal, body.organizationId);
		if (body.providerId !== providerId) {
			throw new NotFoundError(`providerId in body (${body.providerId}) does not match URL (${providerId})`);
		}
		return this.registerCred.execute({
			...body,
			expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
		});
	}

	@Post(':providerId/endpoints/:endpointId/schedule')
	async scheduleEndpoint(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('endpointId') endpointId: string,
		@Body(new ZodValidationPipe(ProviderConnectivityContracts.ScheduleEndpointRequest))
		body: ScheduleEndpointRequest,
	): Promise<{ definitionId: string }> {
		const project = await this.projects.findById(body.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${body.projectId} not found`);
		}
		await this.assertMember(principal, project.organizationId);
		// The worker reads organizationId from params to enforce scoping. Inject it
		// transparently so callers don't need to repeat it.
		const params = { ...body.params, organizationId: project.organizationId };
		return this.schedule.execute({
			projectId: body.projectId,
			providerId,
			endpointId,
			params,
			cron: body.cron,
			credentialOverrideId: body.credentialOverrideId ?? null,
		});
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

	private async assertAdmin(principal: AuthPrincipal, orgId: string): Promise<void> {
		const m = await this.memberships.findActiveFor(
			orgId as IdentityAccess.OrganizationId,
			principal.userId as IdentityAccess.UserId,
		);
		if (!m || !IdentityAccess.isAtLeast(m.role, IdentityAccess.Roles.ADMIN)) {
			throw new ForbiddenError('Admin role required');
		}
	}
}
