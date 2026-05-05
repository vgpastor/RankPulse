import { applyDecorators, Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { ProjectManagement as PMUseCases } from '@rankpulse/application';
import { ProjectManagementContracts } from '@rankpulse/contracts';
import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';

/**
 * BACKLOG #23: legitimate operator setup (importing 2000 keywords or
 * registering a dozen competitors back-to-back) hits the default 600/min
 * throttle. These endpoints opt into a much higher 6000/min `bulk` throttle
 * — the auth guard still gates access, so this only loosens the rate, not
 * the authorization.
 */
const BulkWriteThrottle = applyDecorators(
	SkipThrottle({ default: true, auth: true }),
	Throttle({ bulk: { ttl: 60_000, limit: 6_000 } }),
);

type CreateProjectRequest = ProjectManagementContracts.CreateProjectRequest;
type AddCompetitorRequest = ProjectManagementContracts.AddCompetitorRequest;
type ImportKeywordsRequest = ProjectManagementContracts.ImportKeywordsRequest;
type ProjectDto = ProjectManagementContracts.ProjectDto;

import { NotFoundError } from '@rankpulse/shared';
import { z } from 'zod';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

const ListQuery = z.object({
	organizationId: z.string().uuid(),
});

const AddDomainBody = z.object({
	domain: z.string().min(3).max(253),
	kind: z.enum(['main', 'subdomain', 'alias']).optional(),
});

const AddLocationBody = z.object({
	country: z.string().regex(/^[A-Z]{2}$/),
	language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
});

@Controller('projects')
export class ProjectsController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.CreateProject) private readonly create: PMUseCases.CreateProjectUseCase,
		@Inject(Tokens.AddDomainToProject) private readonly addDomain: PMUseCases.AddDomainToProjectUseCase,
		@Inject(Tokens.AddProjectLocation) private readonly addLocation: PMUseCases.AddProjectLocationUseCase,
		@Inject(Tokens.AddCompetitor) private readonly addCompetitor: PMUseCases.AddCompetitorUseCase,
		@Inject(Tokens.ImportKeywords) private readonly importKeywords: PMUseCases.ImportKeywordsUseCase,
		@Inject(Tokens.ListCompetitorSuggestions)
		private readonly listSuggestions: PMUseCases.ListCompetitorSuggestionsUseCase,
		@Inject(Tokens.PromoteCompetitorSuggestion)
		private readonly promoteSuggestion: PMUseCases.PromoteCompetitorSuggestionUseCase,
		@Inject(Tokens.DismissCompetitorSuggestion)
		private readonly dismissSuggestion: PMUseCases.DismissCompetitorSuggestionUseCase,
		@Inject(Tokens.ProjectRepository) private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.CompetitorRepository) private readonly competitors: ProjectManagement.CompetitorRepository,
		@Inject(Tokens.CompetitorSuggestionRepository)
		private readonly suggestions: ProjectManagement.CompetitorSuggestionRepository,
		@Inject(Tokens.KeywordListRepository)
		private readonly keywordLists: ProjectManagement.KeywordListRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Post()
	async createProject(
		@Principal() principal: AuthPrincipal,
		@Body(new ZodValidationPipe(ProjectManagementContracts.CreateProjectRequest)) body: CreateProjectRequest,
	): Promise<ProjectDto> {
		await this.orgMembership.require(principal, body.organizationId);
		const { projectId } = await this.create.execute(body);
		return this.toDto(projectId);
	}

	@Get()
	async listProjects(
		@Principal() principal: AuthPrincipal,
		@Query(new ZodValidationPipe(ListQuery)) q: z.infer<typeof ListQuery>,
	): Promise<ProjectDto[]> {
		await this.orgMembership.require(principal, q.organizationId);
		const list = await this.projects.listForOrganization(q.organizationId as IdentityAccess.OrganizationId);
		return list.map((p) => this.serialize(p));
	}

	@Get(':id')
	async getProject(@Principal() principal: AuthPrincipal, @Param('id') id: string): Promise<ProjectDto> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		return this.serialize(project);
	}

	@Post(':id/domains')
	async addDomainToProject(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Body(new ZodValidationPipe(AddDomainBody)) body: z.infer<typeof AddDomainBody>,
	): Promise<ProjectDto> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		await this.addDomain.execute({ projectId: id, domain: body.domain, kind: body.kind });
		return this.toDto(id);
	}

	@Post(':id/locations')
	async addLocationToProject(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Body(new ZodValidationPipe(AddLocationBody)) body: z.infer<typeof AddLocationBody>,
	): Promise<ProjectDto> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		await this.addLocation.execute({ projectId: id, country: body.country, language: body.language });
		return this.toDto(id);
	}

	@Post(':id/competitors')
	@BulkWriteThrottle
	async addCompetitorToProject(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Body(new ZodValidationPipe(ProjectManagementContracts.AddCompetitorRequest)) body: AddCompetitorRequest,
	): Promise<{ competitorId: string }> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		return this.addCompetitor.execute({ projectId: id, ...body });
	}

	@Get(':id/competitors')
	async listCompetitors(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
	): Promise<{ id: string; domain: string; label: string; createdAt: string }[]> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.competitors.listForProject(id as ProjectManagement.ProjectId);
		return list.map((c) => ({
			id: c.id,
			domain: c.domain.value,
			label: c.label,
			createdAt: c.createdAt.toISOString(),
		}));
	}

	// BACKLOG #18 — competitor auto-discovery surface area.
	@Get(':id/competitor-suggestions')
	async listCompetitorSuggestions(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Query(new ZodValidationPipe(ProjectManagementContracts.ListCompetitorSuggestionsQuery))
		q: ProjectManagementContracts.ListCompetitorSuggestionsQuery,
	): Promise<ProjectManagementContracts.CompetitorSuggestionDto[]> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		// Default behaviour: surface the eligible bucket only — that's the
		// list the UI shows. The `?eligibleOnly=false` escape hatch is for
		// debugging the threshold policy.
		const eligibleOnly = q.eligibleOnly !== false;
		return this.listSuggestions.execute({ projectId: id, eligibleOnly });
	}

	@Post('competitor-suggestions/:suggestionId/promote')
	async promoteCompetitorSuggestion(
		@Principal() principal: AuthPrincipal,
		@Param('suggestionId') suggestionId: string,
		@Body(new ZodValidationPipe(ProjectManagementContracts.PromoteCompetitorSuggestionRequest))
		body: ProjectManagementContracts.PromoteCompetitorSuggestionRequest,
	): Promise<{ competitorId: string }> {
		await this.requireAccessToSuggestion(principal, suggestionId);
		return this.promoteSuggestion.execute({ suggestionId, label: body.label });
	}

	@Post('competitor-suggestions/:suggestionId/dismiss')
	async dismissCompetitorSuggestion(
		@Principal() principal: AuthPrincipal,
		@Param('suggestionId') suggestionId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToSuggestion(principal, suggestionId);
		await this.dismissSuggestion.execute(suggestionId);
		return { ok: true };
	}

	private async requireAccessToSuggestion(principal: AuthPrincipal, suggestionId: string): Promise<void> {
		const suggestion = await this.suggestions.findById(
			suggestionId as ProjectManagement.CompetitorSuggestionId,
		);
		if (!suggestion) {
			throw new NotFoundError(`Suggestion ${suggestionId} not found`);
		}
		const project = await this.loadProject(suggestion.projectId);
		await this.orgMembership.require(principal, project.organizationId);
	}

	@Post(':id/keywords')
	@BulkWriteThrottle
	async importKeywordsBatch(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
		@Body(new ZodValidationPipe(ProjectManagementContracts.ImportKeywordsRequest))
		body: ImportKeywordsRequest,
	): Promise<{ keywordListId: string; added: number }> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		return this.importKeywords.execute({
			projectId: id,
			keywordListId: body.keywordListId,
			listName: body.listName,
			phrases: body.phrases,
		});
	}

	@Get(':id/keywords')
	async listKeywordLists(
		@Principal() principal: AuthPrincipal,
		@Param('id') id: string,
	): Promise<
		{ id: string; name: string; keywords: { id: string; phrase: string; tags: readonly string[] }[] }[]
	> {
		const project = await this.loadProject(id);
		await this.orgMembership.require(principal, project.organizationId);
		const lists = await this.keywordLists.listForProject(id as ProjectManagement.ProjectId);
		return lists.map((l) => ({
			id: l.id,
			name: l.name,
			keywords: l.keywords.map((k) => ({ id: k.id, phrase: k.phrase.value, tags: k.tags })),
		}));
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${id} not found`);
		}
		return project;
	}

	private async toDto(projectId: string): Promise<ProjectDto> {
		const project = await this.loadProject(projectId);
		return this.serialize(project);
	}

	private serialize(p: ProjectManagement.Project): ProjectDto {
		return {
			id: p.id,
			organizationId: p.organizationId,
			portfolioId: p.portfolioId,
			name: p.name,
			primaryDomain: p.primaryDomain.value,
			kind: p.kind,
			domains: p.domains.map((d) => ({ domain: d.domain.value, kind: d.kind })),
			locations: p.locations.map((l) => ({ country: l.country, language: l.language })),
			archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
			createdAt: p.createdAt.toISOString(),
		};
	}
}
