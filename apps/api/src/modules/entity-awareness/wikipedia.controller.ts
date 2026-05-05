import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { EntityAwareness as EAUseCases } from '@rankpulse/application';
import { EntityAwarenessContracts } from '@rankpulse/contracts';
import type { EntityAwareness, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ForbiddenError, NotFoundError } from '@rankpulse/shared';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { OrgMembership } from '../../common/auth/org-membership.guard.js';
import { Principal } from '../../common/auth/principal.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Tokens } from '../../composition/tokens.js';

/**
 * Issue #33 — entity-awareness via Wikipedia pageviews.
 *
 * Routes nested under /projects/:id for the link/list flows (resource
 * lives within a project), and flat /wikipedia/articles/:id/* for
 * actions on an existing article. Org membership is enforced via the
 * project the article belongs to; the unlink/pageviews paths re-load
 * the article and walk to its project for the membership check.
 */
@Controller()
export class WikipediaController {
	private readonly orgMembership: OrgMembership;

	constructor(
		@Inject(Tokens.LinkWikipediaArticle)
		private readonly linkArticle: EAUseCases.LinkWikipediaArticleUseCase,
		@Inject(Tokens.UnlinkWikipediaArticle)
		private readonly unlinkArticle: EAUseCases.UnlinkWikipediaArticleUseCase,
		@Inject(Tokens.QueryWikipediaPageviews)
		private readonly queryPageviews: EAUseCases.QueryWikipediaPageviewsUseCase,
		@Inject(Tokens.WikipediaArticleRepository)
		private readonly articles: EntityAwareness.WikipediaArticleRepository,
		@Inject(Tokens.ProjectRepository)
		private readonly projects: ProjectManagement.ProjectRepository,
		@Inject(Tokens.MembershipRepository) memberships: IdentityAccess.MembershipRepository,
	) {
		this.orgMembership = new OrgMembership(memberships);
	}

	@Get('projects/:projectId/wikipedia/articles')
	async listForProject(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
	): Promise<EntityAwarenessContracts.WikipediaArticleDto[]> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		const list = await this.articles.listForProject(project.id);
		return list.map((a) => this.serialize(a));
	}

	@Post('projects/:projectId/wikipedia/articles')
	async link(
		@Principal() principal: AuthPrincipal,
		@Param('projectId') projectId: string,
		@Body(new ZodValidationPipe(EntityAwarenessContracts.LinkWikipediaArticleRequest))
		body: EntityAwarenessContracts.LinkWikipediaArticleRequest,
	): Promise<{ articleId: string }> {
		const project = await this.loadProject(projectId);
		await this.orgMembership.require(principal, project.organizationId);
		return this.linkArticle.execute({
			organizationId: project.organizationId,
			projectId: project.id,
			wikipediaProject: body.wikipediaProject,
			slug: body.slug,
			label: body.label,
		});
	}

	@Post('wikipedia/articles/:articleId/unlink')
	async unlink(
		@Principal() principal: AuthPrincipal,
		@Param('articleId') articleId: string,
	): Promise<{ ok: true }> {
		await this.requireAccessToArticle(principal, articleId);
		await this.unlinkArticle.execute(articleId);
		return { ok: true };
	}

	@Get('wikipedia/articles/:articleId/pageviews')
	async pageviews(
		@Principal() principal: AuthPrincipal,
		@Param('articleId') articleId: string,
		@Query(new ZodValidationPipe(EntityAwarenessContracts.WikipediaPageviewQuery))
		q: EntityAwarenessContracts.WikipediaPageviewQuery,
	): Promise<EntityAwarenessContracts.WikipediaPageviewDto[]> {
		await this.requireAccessToArticle(principal, articleId);
		const to = q.to ? new Date(q.to) : new Date();
		const from = q.from ? new Date(q.from) : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
		const result = await this.queryPageviews.execute({ articleId, from, to });
		return [...result];
	}

	private async loadProject(id: string): Promise<ProjectManagement.Project> {
		const project = await this.projects.findById(id as ProjectManagement.ProjectId);
		if (!project) throw new NotFoundError(`Project ${id} not found`);
		return project;
	}

	/**
	 * Mirrors the IDOR-safe pattern used in projects.controller — a
	 * caller from a different tenant gets the SAME 404 whether the
	 * article doesn't exist or exists in another org. Membership errors
	 * are re-mapped to NotFoundError so timing / status oracles can't
	 * enumerate IDs.
	 */
	private async requireAccessToArticle(principal: AuthPrincipal, articleId: string): Promise<void> {
		const article = await this.articles.findById(articleId as EntityAwareness.WikipediaArticleId);
		if (!article) throw new NotFoundError(`Wikipedia article ${articleId} not found`);
		const project = await this.projects.findById(article.projectId);
		if (!project) throw new NotFoundError(`Wikipedia article ${articleId} not found`);
		try {
			await this.orgMembership.require(principal, project.organizationId);
		} catch (err) {
			if (err instanceof ForbiddenError) {
				throw new NotFoundError(`Wikipedia article ${articleId} not found`);
			}
			throw err;
		}
	}

	private serialize(a: EntityAwareness.WikipediaArticle): EntityAwarenessContracts.WikipediaArticleDto {
		return {
			id: a.id,
			projectId: a.projectId,
			wikipediaProject: a.wikipediaProject.value,
			slug: a.slug.value,
			label: a.label,
			linkedAt: a.linkedAt.toISOString(),
			unlinkedAt: a.unlinkedAt ? a.unlinkedAt.toISOString() : null,
		};
	}
}
