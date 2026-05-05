import { ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { competitorSuggestions } from '../../schema/index.js';

const UNIQUE_PROJECT_DOMAIN_CONSTRAINT = 'competitor_suggestions_project_domain_unique';

/**
 * Postgres SQLSTATE 23505 = unique_violation. We only catch the specific
 * (project_id, domain) constraint here — other unique violations bubble
 * up so the worker can flag a real schema problem.
 */
const isProjectDomainUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_PROJECT_DOMAIN_CONSTRAINT;
};

export class DrizzleCompetitorSuggestionRepository
	implements ProjectManagement.CompetitorSuggestionRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async save(suggestion: ProjectManagement.CompetitorSuggestion): Promise<void> {
		const keywords = [...suggestion.keywordsInTop10];
		try {
			await this.db
				.insert(competitorSuggestions)
				.values({
					id: suggestion.id,
					projectId: suggestion.projectId,
					domain: suggestion.domain.value,
					keywordsInTop10: keywords,
					totalTop10Hits: suggestion.totalTop10Hits,
					firstSeenAt: suggestion.firstSeenAt,
					lastSeenAt: suggestion.lastSeenAt,
					status: suggestion.status,
					promotedAt: suggestion.promotedAt,
					dismissedAt: suggestion.dismissedAt,
				})
				.onConflictDoUpdate({
					target: competitorSuggestions.id,
					set: {
						keywordsInTop10: keywords,
						totalTop10Hits: suggestion.totalTop10Hits,
						lastSeenAt: suggestion.lastSeenAt,
						status: suggestion.status,
						promotedAt: suggestion.promotedAt,
						dismissedAt: suggestion.dismissedAt,
					},
				});
		} catch (err) {
			// BACKLOG #1 fix — race: two parallel SERP jobs of the same project
			// can each `observe` the same external domain with DIFFERENT ids.
			// `onConflictDoUpdate(target: id)` only fires on PK collision, so
			// the second insert hits the (project_id, domain) unique. Surface
			// it as ConflictError so the use case can refetch + retry the
			// recordTop10Hit branch.
			if (isProjectDomainUniqueViolation(err)) {
				throw new ConflictError(
					`Suggestion for (${suggestion.projectId}, ${suggestion.domain.value}) already exists`,
				);
			}
			throw err;
		}
	}

	async findById(
		id: ProjectManagement.CompetitorSuggestionId,
	): Promise<ProjectManagement.CompetitorSuggestion | null> {
		const [row] = await this.db
			.select()
			.from(competitorSuggestions)
			.where(eq(competitorSuggestions.id, id))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndDomain(
		projectId: ProjectManagement.ProjectId,
		domain: string,
	): Promise<ProjectManagement.CompetitorSuggestion | null> {
		const [row] = await this.db
			.select()
			.from(competitorSuggestions)
			.where(and(eq(competitorSuggestions.projectId, projectId), eq(competitorSuggestions.domain, domain)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ProjectManagement.CompetitorSuggestion[]> {
		const rows = await this.db
			.select()
			.from(competitorSuggestions)
			.where(eq(competitorSuggestions.projectId, projectId))
			.orderBy(desc(competitorSuggestions.lastSeenAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(
		row: typeof competitorSuggestions.$inferSelect,
	): ProjectManagement.CompetitorSuggestion {
		return ProjectManagement.CompetitorSuggestion.rehydrate({
			id: row.id as ProjectManagement.CompetitorSuggestionId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			domain: ProjectManagement.DomainName.create(row.domain),
			keywordsInTop10: new Set(row.keywordsInTop10),
			totalTop10Hits: row.totalTop10Hits,
			firstSeenAt: row.firstSeenAt,
			lastSeenAt: row.lastSeenAt,
			status: row.status as ProjectManagement.SuggestionStatus,
			promotedAt: row.promotedAt,
			dismissedAt: row.dismissedAt,
		});
	}
}
