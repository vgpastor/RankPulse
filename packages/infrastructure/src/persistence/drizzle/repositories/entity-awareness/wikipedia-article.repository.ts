import { EntityAwareness, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { wikipediaArticles } from '../../schema/index.js';

const UNIQUE_PROJECT_ARTICLE_CONSTRAINT = 'wikipedia_articles_project_article_unique';

const isProjectArticleUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_PROJECT_ARTICLE_CONSTRAINT;
};

export class DrizzleWikipediaArticleRepository implements EntityAwareness.WikipediaArticleRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(article: EntityAwareness.WikipediaArticle): Promise<void> {
		try {
			await this.db
				.insert(wikipediaArticles)
				.values({
					id: article.id,
					organizationId: article.organizationId,
					projectId: article.projectId,
					wikipediaProject: article.wikipediaProject.value,
					slug: article.slug.value,
					label: article.label,
					linkedAt: article.linkedAt,
					unlinkedAt: article.unlinkedAt,
				})
				.onConflictDoUpdate({
					target: wikipediaArticles.id,
					set: {
						label: article.label,
						unlinkedAt: article.unlinkedAt,
					},
				});
		} catch (err) {
			if (isProjectArticleUniqueViolation(err)) {
				throw new ConflictError(
					`Wikipedia article ${article.slug.value} on ${article.wikipediaProject.value} is already linked to project ${article.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(id: EntityAwareness.WikipediaArticleId): Promise<EntityAwareness.WikipediaArticle | null> {
		const [row] = await this.db.select().from(wikipediaArticles).where(eq(wikipediaArticles.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndSlug(
		projectId: ProjectManagement.ProjectId,
		wikipediaProject: EntityAwareness.WikipediaProject,
		slug: EntityAwareness.ArticleSlug,
	): Promise<EntityAwareness.WikipediaArticle | null> {
		const [row] = await this.db
			.select()
			.from(wikipediaArticles)
			.where(
				and(
					eq(wikipediaArticles.projectId, projectId),
					eq(wikipediaArticles.wikipediaProject, wikipediaProject.value),
					eq(wikipediaArticles.slug, slug.value),
				),
			)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly EntityAwareness.WikipediaArticle[]> {
		const rows = await this.db
			.select()
			.from(wikipediaArticles)
			.where(eq(wikipediaArticles.projectId, projectId))
			.orderBy(desc(wikipediaArticles.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly EntityAwareness.WikipediaArticle[]> {
		const rows = await this.db
			.select()
			.from(wikipediaArticles)
			.where(eq(wikipediaArticles.organizationId, orgId))
			.orderBy(desc(wikipediaArticles.linkedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof wikipediaArticles.$inferSelect): EntityAwareness.WikipediaArticle {
		return EntityAwareness.WikipediaArticle.rehydrate({
			id: row.id as EntityAwareness.WikipediaArticleId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			wikipediaProject: EntityAwareness.WikipediaProject.create(row.wikipediaProject),
			slug: EntityAwareness.ArticleSlug.create(row.slug),
			label: row.label,
			linkedAt: row.linkedAt,
			unlinkedAt: row.unlinkedAt,
		});
	}
}
