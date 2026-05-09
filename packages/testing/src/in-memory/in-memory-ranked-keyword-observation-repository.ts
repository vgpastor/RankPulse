import type { ProjectManagement, RankTracking } from '@rankpulse/domain';

/**
 * Mirrors the Drizzle repo contract for `ranked_keywords_observations`. Rows
 * are kept in insertion order; `listLatestForDomain` returns the snapshot at
 * the most recent `observedAt` for the given (project, target) pair so test
 * fixtures simulating multiple monthly snapshots can assert behaviour
 * against the freshest one.
 */
export class InMemoryRankedKeywordObservationRepository
	implements RankTracking.RankedKeywordObservationRepository
{
	rows: RankTracking.RankedKeywordObservation[] = [];

	async saveAll(
		observations: readonly RankTracking.RankedKeywordObservation[],
	): Promise<{ inserted: number }> {
		this.rows.push(...observations);
		return { inserted: observations.length };
	}

	async listLatestForDomain(
		projectId: ProjectManagement.ProjectId,
		targetDomain: string,
		opts: RankTracking.ListRankedKeywordsOptions = {},
	): Promise<readonly RankTracking.RankedKeywordObservation[]> {
		const candidates = this.rows.filter((r) => r.projectId === projectId && r.targetDomain === targetDomain);
		if (candidates.length === 0) return [];
		const latestTs = candidates.reduce(
			(acc, r) => (r.observedAt.getTime() > acc ? r.observedAt.getTime() : acc),
			0,
		);
		return candidates
			.filter((r) => r.observedAt.getTime() === latestTs)
			.filter((r) => (opts.minVolume != null ? (r.searchVolume ?? 0) >= opts.minVolume : true))
			.sort((a, b) => (b.trafficEstimate ?? 0) - (a.trafficEstimate ?? 0))
			.slice(0, opts.limit ?? 500);
	}
}
