import type { EntityAwareness, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `wikipediaArticleId` for `wikipedia-pageviews-per-article`
 * schedules. Same pattern as `GscPropertySystemParamResolver`
 * (BACKLOG bug #50).
 *
 * Looks up the WikipediaArticle entity by
 * `(projectId, params.project, params.article)`. The Wikipedia REST API
 * keys articles on (project, slug) where project is e.g. `en.wikipedia.org`
 * and slug is the title with underscores.
 */
export class WikipediaArticleSystemParamResolver implements SystemParamResolver {
	constructor(private readonly articles: EntityAwareness.WikipediaArticleRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'wikipedia') return {};
		if (input.endpointId !== 'wikipedia-pageviews-per-article') return {};

		const wpProject = input.params.project;
		const article = input.params.article;
		if (typeof wpProject !== 'string' || wpProject.length === 0) {
			throw new InvalidInputError(
				'wikipedia-pageviews schedule requires `params.project` (e.g. "en.wikipedia.org").',
			);
		}
		if (typeof article !== 'string' || article.length === 0) {
			throw new InvalidInputError(
				'wikipedia-pageviews schedule requires `params.article` (URL-encoded slug).',
			);
		}

		const found = await this.articles.findByProjectAndSlug(
			input.projectId as ProjectManagement.ProjectId,
			wpProject as unknown as EntityAwareness.WikipediaProject,
			article as unknown as EntityAwareness.ArticleSlug,
		);
		if (!found?.isActive()) {
			throw new NotFoundError(
				`Wikipedia article ${wpProject}/${article} is not linked to project ${input.projectId}. ` +
					'Link it first via POST /projects/:id/wikipedia/articles.',
			);
		}

		return { wikipediaArticleId: found.id };
	}
}
