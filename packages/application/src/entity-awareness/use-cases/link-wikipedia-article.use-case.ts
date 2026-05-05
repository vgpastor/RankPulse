import {
	EntityAwareness,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkWikipediaArticleCommand {
	organizationId: string;
	projectId: string;
	wikipediaProject: string;
	slug: string;
	label?: string;
}

export interface LinkWikipediaArticleResult {
	articleId: string;
}

/**
 * Operator action: track a Wikipedia article for a project. Idempotent
 * on (project, wp-project, slug) — if the article was already linked
 * AND is still active, returns 409. If it was previously linked and
 * unlinked, this creates a NEW aggregate (fresh id) so the audit trail
 * keeps both linkings as distinct events.
 */
export class LinkWikipediaArticleUseCase {
	constructor(
		private readonly articles: EntityAwareness.WikipediaArticleRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkWikipediaArticleCommand): Promise<LinkWikipediaArticleResult> {
		const wikipediaProject = EntityAwareness.WikipediaProject.create(cmd.wikipediaProject);
		const slug = EntityAwareness.ArticleSlug.create(cmd.slug);
		const projectId = cmd.projectId as ProjectManagement.ProjectId;

		const existing = await this.articles.findByProjectAndSlug(projectId, wikipediaProject, slug);
		if (existing?.isActive()) {
			throw new ConflictError(
				`Wikipedia article "${slug.value}" on ${wikipediaProject.value} is already linked to this project`,
			);
		}

		const articleId = this.ids.generate() as EntityAwareness.WikipediaArticleId;
		const article = EntityAwareness.WikipediaArticle.link({
			id: articleId,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			wikipediaProject,
			slug,
			label: cmd.label,
			now: this.clock.now(),
		});
		await this.articles.save(article);
		await this.events.publish(article.pullEvents());

		return { articleId };
	}
}
