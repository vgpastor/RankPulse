import { type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { rankingObservations } from '../../schema/index.js';

export class DrizzleRankingObservationRepository implements RankTracking.RankingObservationRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(o: RankTracking.RankingObservation): Promise<void> {
		await this.db
			.insert(rankingObservations)
			.values({
				observedAt: o.observedAt,
				trackedKeywordId: o.trackedKeywordId,
				projectId: o.projectId,
				domain: o.domain,
				phrase: o.phrase,
				country: o.country,
				language: o.language,
				device: o.device,
				position: o.position.value,
				url: o.url,
				serpFeatures: o.serpFeatures,
				sourceProvider: o.sourceProvider,
				rawPayloadId: o.rawPayloadId,
			})
			.onConflictDoNothing();
	}

	async findLatestFor(
		trackedKeywordId: RankTracking.TrackedKeywordId,
	): Promise<RankTracking.RankingObservation | null> {
		const [row] = await this.db
			.select()
			.from(rankingObservations)
			.where(eq(rankingObservations.trackedKeywordId, trackedKeywordId))
			.orderBy(desc(rankingObservations.observedAt))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForKeyword(
		trackedKeywordId: RankTracking.TrackedKeywordId,
		from: Date,
		to: Date,
	): Promise<readonly RankTracking.RankingObservation[]> {
		const rows = await this.db
			.select()
			.from(rankingObservations)
			.where(
				and(
					eq(rankingObservations.trackedKeywordId, trackedKeywordId),
					between(rankingObservations.observedAt, from, to),
				),
			)
			.orderBy(rankingObservations.observedAt);
		return rows.map((r) => this.toAggregate(r));
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly RankTracking.RankingObservation[]> {
		const since = sql<Date>`now() - interval '14 days'`;
		const rows = await this.db
			.select()
			.from(rankingObservations)
			.where(and(eq(rankingObservations.projectId, projectId), gte(rankingObservations.observedAt, since)))
			.orderBy(desc(rankingObservations.observedAt))
			.limit(500);
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof rankingObservations.$inferSelect): RankTracking.RankingObservation {
		if (!RankTracking.isDevice(row.device)) {
			throw new InvalidInputError(`Stored ranking observation has invalid device "${row.device}"`);
		}
		return RankTracking.RankingObservation.rehydrate({
			id: `${row.observedAt.toISOString()}#${row.trackedKeywordId}` as RankTracking.RankingObservationId,
			trackedKeywordId: row.trackedKeywordId as RankTracking.TrackedKeywordId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			domain: row.domain,
			phrase: row.phrase,
			country: row.country,
			language: row.language,
			device: row.device,
			position: RankTracking.Position.fromNullable(row.position ?? null),
			url: row.url,
			serpFeatures: row.serpFeatures ?? [],
			sourceProvider: row.sourceProvider,
			rawPayloadId: row.rawPayloadId,
			observedAt: row.observedAt,
		});
	}
}
