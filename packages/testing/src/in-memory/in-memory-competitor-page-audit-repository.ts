import type { CompetitorIntelligence, ProjectManagement } from '@rankpulse/domain';

/**
 * Mirrors the Drizzle repo contract for `competitor_page_audits`. Rows are
 * kept in insertion order; `listLatestForCompetitor`:
 *   - With `opts.url`: returns the single most recent audit for that URL.
 *   - Without `opts.url`: returns one row per URL — the most recent audit
 *     for each — ordered by observed_at DESC.
 */
export class InMemoryCompetitorPageAuditRepository
	implements CompetitorIntelligence.CompetitorPageAuditRepository
{
	rows: CompetitorIntelligence.CompetitorPageAudit[] = [];

	async saveAll(
		audits: readonly CompetitorIntelligence.CompetitorPageAudit[],
	): Promise<{ inserted: number }> {
		this.rows.push(...audits);
		return { inserted: audits.length };
	}

	async listLatestForCompetitor(
		projectId: ProjectManagement.ProjectId,
		competitorDomain: string,
		opts: CompetitorIntelligence.ListCompetitorPageAuditsOptions = {},
	): Promise<readonly CompetitorIntelligence.CompetitorPageAudit[]> {
		const candidates = this.rows.filter(
			(r) => r.projectId === projectId && r.competitorDomain === competitorDomain,
		);
		if (candidates.length === 0) return [];
		const limit = opts.limit ?? 500;
		if (opts.url != null) {
			const forUrl = candidates.filter((r) => r.url === opts.url);
			if (forUrl.length === 0) return [];
			const latest = forUrl.reduce((acc, r) => (r.observedAt.getTime() > acc.observedAt.getTime() ? r : acc));
			return [latest];
		}
		// Latest per URL.
		const byUrl = new Map<string, CompetitorIntelligence.CompetitorPageAudit>();
		for (const r of candidates) {
			const prev = byUrl.get(r.url);
			if (!prev || r.observedAt.getTime() > prev.observedAt.getTime()) {
				byUrl.set(r.url, r);
			}
		}
		return [...byUrl.values()]
			.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
			.slice(0, limit);
	}
}
