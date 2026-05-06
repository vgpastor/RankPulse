import { AiSearchInsights, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { brandPrompts } from '../../schema/index.js';

export class DrizzleBrandPromptRepository implements AiSearchInsights.BrandPromptRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(prompt: AiSearchInsights.BrandPrompt): Promise<void> {
		await this.db
			.insert(brandPrompts)
			.values({
				id: prompt.id,
				organizationId: prompt.organizationId,
				projectId: prompt.projectId,
				text: prompt.text.value,
				kind: prompt.kind,
				pausedAt: prompt.pausedAt,
				createdAt: prompt.createdAt,
			})
			.onConflictDoUpdate({
				target: brandPrompts.id,
				set: { pausedAt: prompt.pausedAt },
			});
	}

	async findById(id: AiSearchInsights.BrandPromptId): Promise<AiSearchInsights.BrandPrompt | null> {
		const [row] = await this.db.select().from(brandPrompts).where(eq(brandPrompts.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async delete(id: AiSearchInsights.BrandPromptId): Promise<void> {
		await this.db.delete(brandPrompts).where(eq(brandPrompts.id, id));
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly AiSearchInsights.BrandPrompt[]> {
		const rows = await this.db.select().from(brandPrompts).where(eq(brandPrompts.projectId, projectId));
		return rows.map((r) => this.toAggregate(r));
	}

	async findExisting(
		projectId: ProjectManagement.ProjectId,
		text: string,
	): Promise<AiSearchInsights.BrandPrompt | null> {
		const [row] = await this.db
			.select()
			.from(brandPrompts)
			.where(and(eq(brandPrompts.projectId, projectId), eq(brandPrompts.text, text)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	private toAggregate(row: typeof brandPrompts.$inferSelect): AiSearchInsights.BrandPrompt {
		if (!AiSearchInsights.isPromptKind(row.kind)) {
			throw new InvalidInputError(`Stored brand_prompt has invalid kind "${row.kind}"`);
		}
		return AiSearchInsights.BrandPrompt.rehydrate({
			id: row.id as AiSearchInsights.BrandPromptId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			text: AiSearchInsights.PromptText.create(row.text),
			kind: row.kind,
			pausedAt: row.pausedAt,
			createdAt: row.createdAt,
		});
	}
}
