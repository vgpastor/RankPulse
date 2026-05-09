import type { ProjectManagement } from '@rankpulse/domain';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { competitorActivityObservations } from '../../schema/index.js';

const unwrap = <T>(rows: unknown): T[] => ((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])) as T[];

const VALID_SOURCES: readonly ProjectManagement.CompetitorActivitySource[] = [
	'wayback-cdx',
	'dataforseo-backlinks',
];

const isValidSource = (s: string): s is ProjectManagement.CompetitorActivitySource =>
	VALID_SOURCES.includes(s as ProjectManagement.CompetitorActivitySource);

export class DrizzleCompetitorActivityObservationRepository
	implements ProjectManagement.CompetitorActivityObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async save(o: ProjectManagement.CompetitorActivityObservation): Promise<void> {
		await this.db
			.insert(competitorActivityObservations)
			.values({
				observedAt: o.observedAt,
				competitorId: o.competitorId,
				projectId: o.projectId,
				source: o.source,
				waybackSnapshotCount: o.wayback?.snapshotCount ?? null,
				waybackLatestSnapshotAt: o.wayback?.latestSnapshotAt ?? null,
				waybackEarliestSnapshotAt: o.wayback?.earliestSnapshotAt ?? null,
				backlinksTotal: o.backlinks?.totalBacklinks ?? null,
				backlinksReferringDomains: o.backlinks?.referringDomains ?? null,
				backlinksReferringMainDomains: o.backlinks?.referringMainDomains ?? null,
				backlinksReferringPages: o.backlinks?.referringPages ?? null,
				backlinksBroken: o.backlinks?.brokenBacklinks ?? null,
				backlinksSpamScore: o.backlinks?.spamScore ?? null,
				backlinksRank: o.backlinks?.rank ?? null,
				rawPayloadId: o.rawPayloadId,
			})
			.onConflictDoUpdate({
				target: [
					competitorActivityObservations.observedAt,
					competitorActivityObservations.competitorId,
					competitorActivityObservations.source,
				],
				set: {
					waybackSnapshotCount: sql`excluded.wayback_snapshot_count`,
					waybackLatestSnapshotAt: sql`excluded.wayback_latest_snapshot_at`,
					waybackEarliestSnapshotAt: sql`excluded.wayback_earliest_snapshot_at`,
					backlinksTotal: sql`excluded.backlinks_total`,
					backlinksReferringDomains: sql`excluded.backlinks_referring_domains`,
					backlinksReferringMainDomains: sql`excluded.backlinks_referring_main_domains`,
					backlinksReferringPages: sql`excluded.backlinks_referring_pages`,
					backlinksBroken: sql`excluded.backlinks_broken`,
					backlinksSpamScore: sql`excluded.backlinks_spam_score`,
					backlinksRank: sql`excluded.backlinks_rank`,
					rawPayloadId: sql`excluded.raw_payload_id`,
				},
			});
	}

	async rollupForProject(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
	): Promise<readonly ProjectManagement.CompetitorActivityRollupRow[]> {
		// Two queries (one per source), pick the latest + the prior observation
		// per competitor with `DISTINCT ON`. The cockpit panel only needs the
		// freshest two points to compute a delta — fetching every snapshot in
		// the window would balloon the response without changing the result.
		const result = await this.db.execute(sql<{
			competitor_id: string;
			source: string;
			rank: number;
			observed_at: Date;
			wayback_snapshot_count: number | null;
			wayback_latest_snapshot_at: Date | null;
			backlinks_total: number | null;
			backlinks_referring_domains: number | null;
		}>`
			WITH ranked AS (
				SELECT
					competitor_id,
					source,
					observed_at,
					wayback_snapshot_count,
					wayback_latest_snapshot_at,
					backlinks_total,
					backlinks_referring_domains,
					ROW_NUMBER() OVER (
						PARTITION BY competitor_id, source
						ORDER BY observed_at DESC
					) AS rank
				FROM competitor_activity_observations
				WHERE project_id = ${projectId}
					AND observed_at >= now() - (${windowDays}::int * interval '1 day')
			)
			SELECT
				competitor_id,
				source,
				rank::int AS rank,
				observed_at,
				wayback_snapshot_count,
				wayback_latest_snapshot_at,
				backlinks_total,
				backlinks_referring_domains
			FROM ranked
			WHERE rank <= 2
			ORDER BY competitor_id, source, rank
		`);
		type Row = {
			competitor_id: string;
			source: string;
			rank: number;
			observed_at: Date;
			wayback_snapshot_count: number | null;
			wayback_latest_snapshot_at: Date | null;
			backlinks_total: number | null;
			backlinks_referring_domains: number | null;
		};
		const rows = unwrap<Row>(result);

		// Group by competitorId. The rollup is `readonly` on the wire so we
		// build a mutable accumulator first and freeze it on the way out.
		interface MutableRollup {
			competitorId: ProjectManagement.CompetitorId;
			latestObservedAt: Date | null;
			latestWayback: ProjectManagement.CompetitorActivityRollupRow['latestWayback'];
			priorWayback: ProjectManagement.CompetitorActivityRollupRow['priorWayback'];
			latestBacklinks: ProjectManagement.CompetitorActivityRollupRow['latestBacklinks'];
			priorBacklinks: ProjectManagement.CompetitorActivityRollupRow['priorBacklinks'];
		}
		const byCompetitor = new Map<string, MutableRollup>();
		const seed = (competitorId: string): MutableRollup => ({
			competitorId: competitorId as ProjectManagement.CompetitorId,
			latestObservedAt: null,
			latestWayback: null,
			priorWayback: null,
			latestBacklinks: null,
			priorBacklinks: null,
		});

		for (const row of rows) {
			if (!isValidSource(row.source)) continue;
			const acc = byCompetitor.get(row.competitor_id) ?? seed(row.competitor_id);
			if (acc.latestObservedAt === null || row.observed_at > acc.latestObservedAt) {
				acc.latestObservedAt = row.observed_at;
			}
			if (row.source === 'wayback-cdx') {
				if (row.rank === 1 && row.wayback_snapshot_count !== null) {
					acc.latestWayback = {
						snapshotCount: Number(row.wayback_snapshot_count),
						latestSnapshotAt: row.wayback_latest_snapshot_at,
						observedAt: row.observed_at,
					};
				} else if (row.rank === 2 && row.wayback_snapshot_count !== null) {
					acc.priorWayback = {
						snapshotCount: Number(row.wayback_snapshot_count),
						observedAt: row.observed_at,
					};
				}
			} else if (row.source === 'dataforseo-backlinks') {
				if (row.rank === 1 && row.backlinks_total !== null) {
					acc.latestBacklinks = {
						totalBacklinks: Number(row.backlinks_total),
						referringDomains: Number(row.backlinks_referring_domains ?? 0),
						observedAt: row.observed_at,
					};
				} else if (row.rank === 2 && row.backlinks_total !== null) {
					acc.priorBacklinks = {
						totalBacklinks: Number(row.backlinks_total),
						referringDomains: Number(row.backlinks_referring_domains ?? 0),
						observedAt: row.observed_at,
					};
				}
			}
			byCompetitor.set(row.competitor_id, acc);
		}

		return [...byCompetitor.values()];
	}
}
