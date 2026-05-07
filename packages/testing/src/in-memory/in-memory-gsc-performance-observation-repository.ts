import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';

/**
 * Mirrors the corrected Drizzle repo contract: `undefined`/`null` on a
 * dimension filter means "no filter on this dimension"; `''` (explicit
 * empty string) targets rows where the dimension was absent in the GSC
 * API response (storage represents absent-dimension via `''` because
 * the natural-key PK can't tolerate NULL).
 */
export class InMemoryGscPerformanceObservationRepository
	implements SearchConsoleInsights.GscPerformanceObservationRepository
{
	private rows: SearchConsoleInsights.GscPerformanceObservation[] = [];

	async saveAll(
		observations: readonly SearchConsoleInsights.GscPerformanceObservation[],
	): Promise<{ inserted: number }> {
		this.rows.push(...observations);
		return { inserted: observations.length };
	}

	async listForProperty(
		propertyId: SearchConsoleInsights.GscPropertyId,
		query: SearchConsoleInsights.GscObservationQuery,
	): Promise<readonly SearchConsoleInsights.GscPerformanceObservation[]> {
		return this.rows
			.filter((r) => r.gscPropertyId === propertyId)
			.filter((r) => r.observedAt >= query.from && r.observedAt <= query.to)
			.filter((r) => (query.query != null ? (r.query ?? '') === query.query : true))
			.filter((r) => (query.page != null ? (r.page ?? '') === query.page : true))
			.filter((r) => (query.country != null ? (r.country ?? '') === query.country : true))
			.filter((r) => (query.device != null ? (r.device ?? '') === query.device : true))
			.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly SearchConsoleInsights.GscPerformanceObservation[]> {
		const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		return this.rows
			.filter((r) => r.projectId === projectId)
			.filter((r) => r.observedAt >= since)
			.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
			.slice(0, 500);
	}
}
