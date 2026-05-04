import { type IdentityAccess, ProjectManagement, RankTracking } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { trackedKeywords } from '../../schema/index.js';

export class DrizzleTrackedKeywordRepository implements RankTracking.TrackedKeywordRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(t: RankTracking.TrackedKeyword): Promise<void> {
		await this.db
			.insert(trackedKeywords)
			.values({
				id: t.id,
				organizationId: t.organizationId,
				projectId: t.projectId,
				domain: t.domain.value,
				phrase: t.phrase.value,
				country: t.location.country,
				language: t.location.language,
				device: t.device,
				searchEngine: t.searchEngine,
				pausedAt: t.pausedAt,
				startedAt: t.startedAt,
			})
			.onConflictDoUpdate({
				target: trackedKeywords.id,
				set: { pausedAt: t.pausedAt },
			});
	}

	async findById(id: RankTracking.TrackedKeywordId): Promise<RankTracking.TrackedKeyword | null> {
		const [row] = await this.db.select().from(trackedKeywords).where(eq(trackedKeywords.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findExisting(input: {
		projectId: ProjectManagement.ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: string;
	}): Promise<RankTracking.TrackedKeyword | null> {
		const [row] = await this.db
			.select()
			.from(trackedKeywords)
			.where(
				and(
					eq(trackedKeywords.projectId, input.projectId),
					eq(trackedKeywords.domain, input.domain),
					eq(trackedKeywords.phrase, input.phrase),
					eq(trackedKeywords.country, input.country),
					eq(trackedKeywords.language, input.language),
					eq(trackedKeywords.device, input.device),
				),
			)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly RankTracking.TrackedKeyword[]> {
		const rows = await this.db.select().from(trackedKeywords).where(eq(trackedKeywords.projectId, projectId));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly RankTracking.TrackedKeyword[]> {
		const rows = await this.db
			.select()
			.from(trackedKeywords)
			.where(eq(trackedKeywords.organizationId, orgId));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof trackedKeywords.$inferSelect): RankTracking.TrackedKeyword {
		if (!RankTracking.isDevice(row.device)) {
			throw new InvalidInputError(`Stored tracked keyword has invalid device "${row.device}"`);
		}
		if (!RankTracking.isSearchEngine(row.searchEngine)) {
			throw new InvalidInputError(`Stored tracked keyword has invalid search engine "${row.searchEngine}"`);
		}
		return RankTracking.TrackedKeyword.rehydrate({
			id: row.id as RankTracking.TrackedKeywordId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			domain: ProjectManagement.DomainName.create(row.domain),
			phrase: ProjectManagement.KeywordPhrase.create(row.phrase),
			location: ProjectManagement.LocationLanguage.create({ country: row.country, language: row.language }),
			device: row.device,
			searchEngine: row.searchEngine,
			pausedAt: row.pausedAt,
			startedAt: row.startedAt,
		});
	}
}
