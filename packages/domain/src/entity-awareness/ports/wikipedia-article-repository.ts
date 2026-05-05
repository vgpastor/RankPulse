import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { WikipediaArticle } from '../entities/wikipedia-article.js';
import type { ArticleSlug } from '../value-objects/article-slug.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';
import type { WikipediaProject } from '../value-objects/wikipedia-project.js';

export interface WikipediaArticleRepository {
	save(article: WikipediaArticle): Promise<void>;
	findById(id: WikipediaArticleId): Promise<WikipediaArticle | null>;
	/** Used by the link use case to enforce idempotency on (project, wp-project, slug). */
	findByProjectAndSlug(
		projectId: ProjectId,
		wikipediaProject: WikipediaProject,
		slug: ArticleSlug,
	): Promise<WikipediaArticle | null>;
	listForProject(projectId: ProjectId): Promise<readonly WikipediaArticle[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly WikipediaArticle[]>;
}
