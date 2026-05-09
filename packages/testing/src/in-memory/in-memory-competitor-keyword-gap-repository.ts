import type { CompetitorIntelligence, ProjectManagement } from '@rankpulse/domain';

/**
 * Mirrors the Drizzle repo contract for `competitor_keyword_gaps`. Rows are
 * kept in insertion order; `listLatestForCompetitor` returns the snapshot at
 * the most recent `observedAt` for the (project, ourDomain, competitorDomain)
 * tuple, ranked by ROI score `(volume × cpc) / (kd + 1)` DESC. Rows whose
 * roiScore is null (missing volume or CPC) sink to the bottom — matching the
 * SQL `NULLS LAST` semantic.
 */
export class InMemoryCompetitorKeywordGapRepository
	implements CompetitorIntelligence.CompetitorKeywordGapRepository
{
	rows: CompetitorIntelligence.CompetitorKeywordGap[] = [];

	async saveAll(gaps: readonly CompetitorIntelligence.CompetitorKeywordGap[]): Promise<{ inserted: number }> {
		this.rows.push(...gaps);
		return { inserted: gaps.length };
	}

	async listLatestForCompetitor(
		projectId: ProjectManagement.ProjectId,
		ourDomain: string,
		competitorDomain: string,
		opts: CompetitorIntelligence.ListCompetitorKeywordGapsOptions = {},
	): Promise<readonly CompetitorIntelligence.CompetitorKeywordGap[]> {
		const candidates = this.rows.filter(
			(r) =>
				r.projectId === projectId && r.ourDomain === ourDomain && r.competitorDomain === competitorDomain,
		);
		if (candidates.length === 0) return [];
		const latestTs = candidates.reduce(
			(acc, r) => (r.observedAt.getTime() > acc ? r.observedAt.getTime() : acc),
			0,
		);
		return candidates
			.filter((r) => r.observedAt.getTime() === latestTs)
			.filter((r) => (opts.minVolume != null ? (r.searchVolume ?? 0) >= opts.minVolume : true))
			.sort((a, b) => {
				const ra = a.roiScore;
				const rb = b.roiScore;
				if (ra == null && rb == null) return 0;
				if (ra == null) return 1; // NULLS LAST
				if (rb == null) return -1;
				return rb - ra;
			})
			.slice(0, opts.limit ?? 500);
	}
}
