import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Inject,
	Param,
	Patch,
	Post,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { ProviderConnectivity as PCUseCases } from '@rankpulse/application';
import { ProviderConnectivityContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import type { AuthStrategy, ManifestProviderRegistry } from '@rankpulse/provider-core';
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

/**
 * Entity-bound endpoints — these are auto-scheduled by their bounded
 * context's link/add handler. The manual schedule route is blocked because
 * it can't reliably populate the systemParam (which entity does
 * `siteUrl=https://x` map to? the controller can't answer without coupling
 * to every other context).
 *
 * If you're adding a new entity-bound endpoint:
 *  1. Implement `AutoScheduleOn<X>LinkedHandler` in its bounded context.
 *  2. Wire it in composition-root.
 *  3. Add the endpoint here.
 */
/**
 * Maps the manifest's `AuthStrategy.kind` (Phase 6 of ADR 0002) to the
 * legacy single-string `authStrategy` field exposed in the public API
 * (`apiKey | basic | oauth2 | serviceAccount`). Kept as a translation
 * shim so existing frontend consumers don't need to migrate.
 */
const legacyAuthStrategyFor = (
	kind: AuthStrategy['kind'],
): 'apiKey' | 'basic' | 'oauth2' | 'serviceAccount' => {
	switch (kind) {
		case 'basic':
			return 'basic';
		case 'service-account-jwt':
			return 'serviceAccount';
		case 'oauth-token':
			return 'oauth2';
		case 'api-key-or-service-account-jwt':
			return 'serviceAccount';
		default:
			return 'apiKey';
	}
};

const ENTITY_BOUND_ENDPOINTS: Record<string, { provider: string; preferredRoute: string }> = {
	'gsc-search-analytics': {
		provider: 'google-search-console',
		preferredRoute: '/api/v1/gsc/properties',
	},
	'ga4-run-report': {
		provider: 'google-analytics-4',
		preferredRoute: '/api/v1/projects/:projectId/ga4/properties',
	},
	'wikipedia-pageviews-per-article': {
		provider: 'wikipedia',
		preferredRoute: '/api/v1/projects/:projectId/wikipedia/articles',
	},
	'bing-rank-and-traffic-stats': {
		provider: 'bing-webmaster',
		preferredRoute: '/api/v1/projects/:projectId/bing/properties',
	},
	'clarity-data-export': {
		provider: 'microsoft-clarity',
		preferredRoute: '/api/v1/projects/:projectId/clarity/projects',
	},
	'psi-runpagespeed': {
		provider: 'pagespeed',
		preferredRoute: '/api/v1/projects/:projectId/page-speed/pages',
	},
	'radar-domain-rank': {
		provider: 'cloudflare-radar',
		preferredRoute: '/api/v1/projects/:projectId/radar/domains',
	},
	// AI Brand Radar — auto-scheduled by AutoScheduleOnBrandPromptCreatedHandler
	// (one schedule per provider × project locale).
	'openai-responses-with-web-search': {
		provider: 'openai',
		preferredRoute: '/api/v1/projects/:projectId/brand-prompts',
	},
	'anthropic-messages-with-web-search': {
		provider: 'anthropic',
		preferredRoute: '/api/v1/projects/:projectId/brand-prompts',
	},
	'perplexity-sonar-search': {
		provider: 'perplexity',
		preferredRoute: '/api/v1/projects/:projectId/brand-prompts',
	},
	'google-ai-studio-gemini-grounded': {
		provider: 'google-ai-studio',
		preferredRoute: '/api/v1/projects/:projectId/brand-prompts',
	},
	// Meta — auto-scheduled by AutoScheduleOnMetaPixelLinkedHandler /
	// AutoScheduleOnMetaAdAccountLinkedHandler. The ad-account link fans
	// into both ads-insights AND custom-audiences with one event.
	'meta-pixel-events-stats': {
		provider: 'meta',
		preferredRoute: '/api/v1/projects/:projectId/meta/pixels',
	},
	'meta-ads-insights': {
		provider: 'meta',
		preferredRoute: '/api/v1/projects/:projectId/meta/ad-accounts',
	},
	'meta-custom-audiences': {
		provider: 'meta',
		preferredRoute: '/api/v1/projects/:projectId/meta/ad-accounts',
	},
};

@Controller('providers')
export class ProvidersController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.ProviderRegistry) private readonly registry: ManifestProviderRegistry,
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
		return this.registry.list().map((m) => ({
			id: m.id,
			displayName: m.displayName,
			// Legacy `authStrategy: 'apiKey' | 'basic' | 'oauth2' | 'serviceAccount'`
			// inferred from the manifest's discriminated `auth.kind` (Phase 6 of
			// ADR 0002 — manifests carry the structured `AuthStrategy` union; the
			// API surface keeps the old string for back-compat with existing
			// frontend consumers).
			authStrategy: legacyAuthStrategyFor(m.http.auth.kind),
			endpoints: m.endpoints.map((ep) => ({
				id: ep.descriptor.id,
				category: ep.descriptor.category,
				displayName: ep.descriptor.displayName,
				description: ep.descriptor.description,
				defaultCron: ep.descriptor.defaultCron,
				cost: ep.descriptor.cost,
				rateLimit: ep.descriptor.rateLimit,
			})),
		}));
	}

	@Get(':providerId/endpoints')
	listEndpoints(@Param('providerId') providerId: string): ProviderDto['endpoints'] {
		const manifest = this.registry.get(providerId);
		return manifest.endpoints.map((ep) => ({
			id: ep.descriptor.id,
			category: ep.descriptor.category,
			displayName: ep.descriptor.displayName,
			description: ep.descriptor.description,
			defaultCron: ep.descriptor.defaultCron,
			cost: ep.descriptor.cost,
			rateLimit: ep.descriptor.rateLimit,
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

	@SkipThrottle({ default: true, auth: true })
	@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
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

	@SkipThrottle({ default: true, auth: true })
	@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
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

	@SkipThrottle({ default: true, auth: true })
	@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
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
	@SkipThrottle({ default: true, auth: true })
	@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })
	async scheduleEndpoint(
		@Principal() principal: AuthPrincipal,
		@Param('providerId') providerId: string,
		@Param('endpointId') endpointId: string,
		@Body(new ZodValidationPipe(ProviderConnectivityContracts.ScheduleEndpointRequest))
		body: ScheduleEndpointRequest,
	): Promise<{ definitionId: string }> {
		// Block the manual schedule route for entity-bound endpoints — those
		// are auto-scheduled by their bounded context's link/add handler when
		// the underlying entity is created. See ADR 0001.
		const entityBound = ENTITY_BOUND_ENDPOINTS[endpointId];
		if (entityBound && entityBound.provider === providerId) {
			throw new BadRequestException(
				`Endpoint ${providerId}/${endpointId} is auto-scheduled when you link the entity. ` +
					`Use ${entityBound.preferredRoute} instead. ` +
					`(See ADR 0001 — direct schedule blocked for entity-bound endpoints.)`,
			);
		}
		const project = await this.projects.findById(body.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${body.projectId} not found`);
		}
		await this.orgMembership.require(principal, project.organizationId);
		// `systemParams` are merged after Zod validation so they survive the
		// endpoint's paramsSchema strip. `organizationId` is forced from the
		// project (not user-supplied — security boundary); the rest of the
		// orchestration fields (projectId/phrase/country/language/device for
		// SERP fan-out, gscPropertyId for GSC, etc.) come from the request
		// body so the caller has explicit control.
		const systemParams: Record<string, unknown> = {
			...(body.systemParams ?? {}),
			organizationId: project.organizationId,
		};
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
