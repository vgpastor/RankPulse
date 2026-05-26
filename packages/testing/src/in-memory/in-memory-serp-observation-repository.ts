import type { ProjectManagement, RankTracking } from '@rankpulse/domain';

/**
 * Mirrors the Drizzle repo contract for `serp_observations`. Test fixtures
 * push snapshots via `save`; `listLatestForProject` returns the freshest
 * observation per (phrase, country, language, device) tuple within the
 * rolling `windowDays` window — same semantics as the SQL CTE.
 *
 * Used by `QuerySerpMapUseCase` tests so the use case can assert against
 * the freshest snapshot without standing up Postgres. The drizzle repo
 * has its own `.spec.ts` covering the postgres-js timestamp coercion
 * (regression guard for issue #182).
 */
export class InMemorySerpObservationRepository implements RankTracking.SerpObservationRepository {
	rows: RankTracking.SerpObservation[] = [];

	async save(observation: RankTracking.SerpObservation): Promise<void> {
		this.rows.push(observation);
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
		filter?: RankTracking.SerpMapQueryFilter,
	): Promise<readonly RankTracking.SerpObservation[]> {
		const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
		const candidates = this.rows.filter((r) => {
			if (r.projectId !== projectId) return false;
			if (r.observedAt < cutoff) return false;
			if (filter?.phrase && r.phrase !== filter.phrase) return false;
			if (filter?.country && r.country !== filter.country) return false;
			if (filter?.language && r.language !== filter.language) return false;
			return true;
		});
		// Latest per (phrase, country, language, device).
		const latestByKey = new Map<string, RankTracking.SerpObservation>();
		for (const obs of candidates) {
			const key = `${obs.phrase}|${obs.country}|${obs.language}|${obs.device}`;
			const existing = latestByKey.get(key);
			if (!existing || obs.observedAt > existing.observedAt) {
				latestByKey.set(key, obs);
			}
		}
		return [...latestByKey.values()];
	}

	async listCompetitorSuggestions(): Promise<readonly RankTracking.CompetitorSuggestionRow[]> {
		// Not part of the bug surface this in-memory repo was added for.
		// Tests that need this should extend the repo or use a different fake.
		return [];
	}
}
