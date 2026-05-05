import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ProviderConnectivity as PCUseCases } from '@rankpulse/application';
import { ProviderConnectivityContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import { NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

type RegisterCredentialRequest = ProviderConnectivityContracts.RegisterCredentialRequest;
type ScheduleEndpointRequest = ProviderConnectivityContracts.ScheduleEndpointRequest;
type UpdateJobDefinitionRequest = ProviderConnectivityContracts.UpdateJobDefinitionRequest;
type ProviderDto = ProviderConnectivityContracts.ProviderDto;
type JobDefinitionDto = ProviderConnectivityContracts.JobDefinitionDto;
type JobRunDto = ProviderConnectivityContracts.JobRunDto;

@Controller('providers')
export class ProvidersController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.ProviderRegistry) private readonly registry: ProviderRegistry,
		@Inject(Tokens.RegisterProviderCredential)
		private readonly registerCred: PCUseCases.RegisterProviderCredentialUseCase,
		@Inject(Tokens.ScheduleEndpointFetch) private readonly schedule: PCUseCases.ScheduleEndpointFetchUseCase,
		@Inject(Tokens.TriggerJobDefinitionRun)
		private readonly triggerRun: PCUseCases.TriggerJobDefinitionRunUseCase,
		@Inject(Tokens.ListJobDefinitions)
		private readonly listJobs: PCUseCases.ListJobDefinitionsUseCase,
		@Inject(Tokens.GetJobDefinition)
		private readonly getJob: PCUseCases.GetJobDefinitionUseCase,
		@Inject(Tokens.UpdateJobDefinition)
		private readonly updateJob: PCUseCases.UpdateJobDefinitionUseCase,
		@Inject(Tokens.DeleteJobDefinition)
		private readonly deleteJob: PCUseCases.DeleteJobDefinitionUseCase,
		@Inject(Tokens.ListJobRuns)
		private readonly listRuns: PCUseCases.ListJobRunsUseCase,
		@Inject(Tokens.JobDefinitionRepository)
		private readonly jobDefs: ProviderConnectivity.JobDefinitionRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	private async loadDefinitionAndAuthorize(
		principal: AuthPrincipal,
		providerId: string,
		definitionId: string,
	): Promise<ProviderConnectivity.ProviderJobDefinition> {
		const definition = await this.jobDefs.findById(
			definitionId as ProviderConnectivity.ProviderJobDefinitionId,
		);
		if (!definition) {
			throw new NotFoundError(`Job definition ${definitionId} not found`);
		}
		if (definition.providerId.value !== providerId) {
			throw new NotFoundError(`Job definition ${definitionId} does not belong to provider ${providerId}`);
		}
		const project = await this.projects.findById(definition.projectId);
		if (!project) {
			throw new NotFoundError(`Project ${definition.projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return definition;
	}

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
		await this.orgMembership.requireAdmin(principal, body.organizationId);
		if (body.providerId !== providerId) {
			throw new NotFoundError(`providerId in body (${body.providerId}) does not match URL (${providerId})`);
		}
		return this.registerCred.execute({
			...body,
			expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
		});
	}

	@Post(':providerId/job-definitions/:definitionId/run-now')
	async runNow(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('definitionId') definitionId: string,
	): Promise<{ runId: string; definitionId: string }> {
		await this.loadDefinitionAndAuthorize(principal, providerId, definitionId);
		return this.triggerRun.execute({ definitionId });
	}

	@Get('job-definitions/by-project/:projectId')
	async listJobDefinitions(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<JobDefinitionDto[]> {
		const project = await this.projects.findById(projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		return this.listJobs.execute(projectId);
	}

	@Get(':providerId/job-definitions/:definitionId')
	async getJobDefinition(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('definitionId') definitionId: string,
	): Promise<JobDefinitionDto> {
		await this.loadDefinitionAndAuthorize(principal, providerId, definitionId);
		return this.getJob.execute(definitionId);
	}

	@Patch(':providerId/job-definitions/:definitionId')
	async patchJobDefinition(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('definitionId') definitionId: string,
		@Body(new ZodValidationPipe(ProviderConnectivityContracts.UpdateJobDefinitionRequest))
		body: UpdateJobDefinitionRequest,
	): Promise<JobDefinitionDto> {
		await this.loadDefinitionAndAuthorize(principal, providerId, definitionId);
		return this.updateJob.execute({ definitionId, ...body });
	}

	@Get(':providerId/job-definitions/:definitionId/runs')
	async listJobRuns(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('definitionId') definitionId: string,
	): Promise<JobRunDto[]> {
		await this.loadDefinitionAndAuthorize(principal, providerId, definitionId);
		return this.listRuns.execute({ definitionId });
	}

	@Delete(':providerId/job-definitions/:definitionId')
	@HttpCode(204)
	async deleteJobDefinition(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('definitionId') definitionId: string,
	): Promise<void> {
		await this.loadDefinitionAndAuthorize(principal, providerId, definitionId);
		await this.deleteJob.execute(definitionId);
	}

	@Post(':providerId/endpoints/:endpointId/schedule')
	@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
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
		await this.orgMembership.require(principal, project.organizationId);
		// `systemParams` are merged after Zod validation so they survive the
		// endpoint's paramsSchema strip (organizationId scopes the run for the
		// worker; trackedKeywordId tells the processor to materialize a
		// RankingObservation per fetched SERP — see BACKLOG #9).
		const systemParams: Record<string, unknown> = { organizationId: project.organizationId };
		if (body.trackedKeywordId) systemParams.trackedKeywordId = body.trackedKeywordId;
		return this.schedule.execute({
			projectId: body.projectId,
			providerId,
			endpointId,
			params: body.params,
			systemParams,
			cron: body.cron,
			credentialOverrideId: body.credentialOverrideId ?? null,
		});
	}
}
