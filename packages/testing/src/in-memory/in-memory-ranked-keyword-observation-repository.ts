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

	async aggregateMonthlyVolumeForProject(
		projectId: ProjectManagement.ProjectId,
		opts: RankTracking.AggregateMonthlyVolumeOptions,
	): Promise<readonly RankTracking.MonthlyVolumeBucket[]> {
		const cutoff = new Date(Date.now() - opts.months * 30 * 24 * 60 * 60 * 1000);
		const candidates = this.rows.filter((r) => {
			if (r.projectId !== projectId) return false;
			if (r.observedAt < cutoff) return false;
			if (opts.targetDomain && r.targetDomain !== opts.targetDomain) return false;
			return true;
		});
		// Per (month, target_domain, keyword), keep the latest snapshot.
		const latestPerKey = new Map<string, RankTracking.RankedKeywordObservation>();
		for (const r of candidates) {
			const month = startOfUtcMonth(r.observedAt).toISOString();
			const key = `${month}::${r.targetDomain}::${r.keyword}`;
			const existing = latestPerKey.get(key);
			if (!existing || r.observedAt > existing.observedAt) {
				latestPerKey.set(key, r);
			}
		}
		// Group by month → sum.
		const byMonth = new Map<string, { totalVolume: number; keywords: Set<string> }>();
		for (const r of latestPerKey.values()) {
			const monthKey = startOfUtcMonth(r.observedAt).toISOString();
			const acc = byMonth.get(monthKey) ?? { totalVolume: 0, keywords: new Set<string>() };
			acc.totalVolume += r.searchVolume ?? 0;
			acc.keywords.add(r.keyword);
			byMonth.set(monthKey, acc);
		}
		return [...byMonth.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([month, v]) => ({
				month: new Date(month),
				totalVolume: v.totalVolume,
				distinctKeywords: v.keywords.size,
			}));
	}
}

const startOfUtcMonth = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
