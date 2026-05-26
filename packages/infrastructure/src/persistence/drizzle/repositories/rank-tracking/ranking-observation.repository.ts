import { type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { rankingObservations } from '../../schema/index.js';
import { toDate, unwrap } from '../../utils/postgres-js-coercions.js';

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

	/**
	 * #171 — one row per tracked keyword with the latest position + position
	 * snapshots from ~1d and ~7d ago. Computed as 3 correlated lookups per
	 * row (cheap at the project scale: ≤500 tracked keywords). The 20h /
	 * 6d gaps tolerate same-day re-runs and weekend skips without forcing
	 * the comparison to land on the exact-second cron tick.
	 */
	async listProjectRankingsWithDeltas(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly RankTracking.ProjectRankingSnapshot[]> {
		const result = await this.db.execute(sql<{
			tracked_keyword_id: string;
			phrase: string;
			domain: string;
			country: string;
			language: string;
			device: string;
			position: number | null;
			url: string | null;
			observed_at: Date;
			previous_position: number | null;
			position_1d_ago: number | null;
			position_7d_ago: number | null;
		}>`
			WITH latest AS (
				SELECT DISTINCT ON (tracked_keyword_id)
					tracked_keyword_id, phrase, domain, country, language, device,
					position, url, observed_at
				FROM ranking_observations
				WHERE project_id = ${projectId}::uuid
				  AND observed_at >= now() - interval '30 days'
				ORDER BY tracked_keyword_id, observed_at DESC
			)
			SELECT
				l.tracked_keyword_id,
				l.phrase,
				l.domain,
				l.country,
				l.language,
				l.device,
				l.position,
				l.url,
				l.observed_at,
				(
					SELECT r.position FROM ranking_observations r
					WHERE r.tracked_keyword_id = l.tracked_keyword_id
					  AND r.observed_at < l.observed_at
					ORDER BY r.observed_at DESC
					LIMIT 1
				) AS previous_position,
				(
					SELECT r.position FROM ranking_observations r
					WHERE r.tracked_keyword_id = l.tracked_keyword_id
					  AND r.observed_at <= l.observed_at - interval '20 hours'
					ORDER BY r.observed_at DESC
					LIMIT 1
				) AS position_1d_ago,
				(
					SELECT r.position FROM ranking_observations r
					WHERE r.tracked_keyword_id = l.tracked_keyword_id
					  AND r.observed_at <= l.observed_at - interval '6 days 12 hours'
					ORDER BY r.observed_at DESC
					LIMIT 1
				) AS position_7d_ago
			FROM latest l
			ORDER BY l.observed_at DESC
			LIMIT 500
		`);
		const rows = unwrap<{
			tracked_keyword_id: string;
			phrase: string;
			domain: string;
			country: string;
			language: string;
			device: string;
			position: number | null;
			url: string | null;
			observed_at: Date | string;
			previous_position: number | null;
			position_1d_ago: number | null;
			position_7d_ago: number | null;
		}>(result);
		return rows.map((r) => {
			if (!RankTracking.isDevice(r.device)) {
				throw new InvalidInputError(`Stored ranking observation has invalid device "${r.device}"`);
			}
			const position = r.position ?? null;
			const previousPosition = r.previous_position ?? null;
			const position1dAgo = r.position_1d_ago ?? null;
			const position7dAgo = r.position_7d_ago ?? null;
			return {
				trackedKeywordId: r.tracked_keyword_id as RankTracking.TrackedKeywordId,
				phrase: r.phrase,
				domain: r.domain,
				country: r.country,
				language: r.language,
				device: r.device,
				position,
				url: r.url,
				observedAt: toDate(r.observed_at),
				previousPosition,
				position1dAgo,
				position7dAgo,
				positionChange1d: position !== null && position1dAgo !== null ? position - position1dAgo : null,
				positionChange7d: position !== null && position7dAgo !== null ? position - position7dAgo : null,
			};
		});
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
