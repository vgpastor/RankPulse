import { ProjectManagement } from '@rankpulse/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { competitorSuggestions } from '../../schema/index.js';

export class DrizzleCompetitorSuggestionRepository
	implements ProjectManagement.CompetitorSuggestionRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async save(suggestion: ProjectManagement.CompetitorSuggestion): Promise<void> {
		const keywords = [...suggestion.keywordsInTop10];
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
