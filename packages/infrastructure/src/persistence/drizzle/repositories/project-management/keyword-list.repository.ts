import { ProjectManagement } from '@rankpulse/domain';
import { desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { keywordLists, keywords } from '../../schema/index.js';

export class DrizzleKeywordListRepository implements ProjectManagement.KeywordListRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(list: ProjectManagement.KeywordList): Promise<void> {
		await this.db.transaction(async (tx) => {
			await tx
				.insert(keywordLists)
				.values({
					id: list.id,
					projectId: list.projectId,
					name: list.name,
					createdAt: list.createdAt,
				})
				.onConflictDoUpdate({
					target: keywordLists.id,
					set: { name: list.name },
				});

			await tx.delete(keywords).where(eq(keywords.listId, list.id));
			if (list.keywords.length > 0) {
				await tx.insert(keywords).values(
					list.keywords.map((k) => ({
						id: k.id,
						listId: list.id,
						phrase: k.phrase.value,
						tags: k.tags,
					})),
				);
			}
		});
	}

	async findById(id: ProjectManagement.KeywordListId): Promise<ProjectManagement.KeywordList | null> {
		const [row] = await this.db.select().from(keywordLists).where(eq(keywordLists.id, id)).limit(1);
		if (!row) return null;
		return this.assemble(row);
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ProjectManagement.KeywordList[]> {
		const rows = await this.db
			.select()
			.from(keywordLists)
			.where(eq(keywordLists.projectId, projectId))
			.orderBy(desc(keywordLists.createdAt));
		return Promise.all(rows.map((r) => this.assemble(r)));
	}

	private async assemble(row: typeof keywordLists.$inferSelect): Promise<ProjectManagement.KeywordList> {
		const entries = await this.db.select().from(keywords).where(eq(keywords.listId, row.id));
		return ProjectManagement.KeywordList.rehydrate({
			id: row.id as ProjectManagement.KeywordListId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			name: row.name,
			keywords: entries.map((k) => ({
				id: k.id as ProjectManagement.KeywordId,
				phrase: ProjectManagement.KeywordPhrase.create(k.phrase),
				tags: k.tags ?? [],
			})),
			createdAt: row.createdAt,
		});
	}
}
