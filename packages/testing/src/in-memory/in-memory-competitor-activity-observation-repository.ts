import type { ProjectManagement } from '@rankpulse/domain';

/**
 * Mirrors the Drizzle repo contract for `competitor_activity_observations`.
 * Fixtures push observations via `save`; `rollupForProject` mimics the
 * SQL DISTINCT ON / ROW_NUMBER fan-out to expose latest + prior snapshot
 * per (competitor, source).
 *
 * Used by `QueryCompetitorActivityUseCase` tests so the use case can
 * assert against in-memory data without standing up Postgres. The
 * drizzle repo has its own `.spec.ts` covering the postgres-js timestamp
 * coercion (regression guard for issue #179).
 */
export class InMemoryCompetitorActivityObservationRepository
	implements ProjectManagement.CompetitorActivityObservationRepository
{
	rows: ProjectManagement.CompetitorActivityObservation[] = [];

	async save(observation: ProjectManagement.CompetitorActivityObservation): Promise<void> {
		// Idempotent on (competitor_id, source, observed_at) — match the
		// real repo's onConflictDoUpdate semantics.
		this.rows = this.rows.filter(
			(r) =>
				!(
					r.competitorId === observation.competitorId &&
					r.source === observation.source &&
					r.observedAt.getTime() === observation.observedAt.getTime()
				),
		);
		this.rows.push(observation);
	}

	async rollupForProject(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
	): Promise<readonly ProjectManagement.CompetitorActivityRollupRow[]> {
		const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
		const inWindow = this.rows
			.filter((r) => r.projectId === projectId && r.observedAt >= cutoff)
			.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());

		// Group by (competitor, source), keep [latest, prior].
		const byKey = new Map<string, ProjectManagement.CompetitorActivityObservation[]>();
		for (const obs of inWindow) {
			const key = `${obs.competitorId}::${obs.source}`;
			const list = byKey.get(key) ?? [];
			if (list.length < 2) list.push(obs);
			byKey.set(key, list);
		}

		interface MutableRollup {
			competitorId: ProjectManagement.CompetitorId;
			latestObservedAt: Date | null;
			latestWayback: ProjectManagement.CompetitorActivityRollupRow['latestWayback'];
			priorWayback: ProjectManagement.CompetitorActivityRollupRow['priorWayback'];
			latestBacklinks: ProjectManagement.CompetitorActivityRollupRow['latestBacklinks'];
			priorBacklinks: ProjectManagement.CompetitorActivityRollupRow['priorBacklinks'];
		}
		const byCompetitor = new Map<string, MutableRollup>();
		const seed = (competitorId: ProjectManagement.CompetitorId): MutableRollup => ({
			competitorId,
			latestObservedAt: null,
			latestWayback: null,
			priorWayback: null,
			latestBacklinks: null,
			priorBacklinks: null,
		});

		for (const [key, observations] of byKey) {
			const [latest, prior] = observations;
			if (!latest) continue;
			const acc = byCompetitor.get(latest.competitorId) ?? seed(latest.competitorId);
			if (acc.latestObservedAt === null || latest.observedAt > acc.latestObservedAt) {
				acc.latestObservedAt = latest.observedAt;
			}
			if (latest.source === 'wayback-cdx' && latest.wayback) {
				acc.latestWayback = {
					snapshotCount: latest.wayback.snapshotCount,
					latestSnapshotAt: latest.wayback.latestSnapshotAt,
					observedAt: latest.observedAt,
				};
				if (prior?.wayback) {
					acc.priorWayback = {
						snapshotCount: prior.wayback.snapshotCount,
						observedAt: prior.observedAt,
					};
				}
			} else if (latest.source === 'dataforseo-backlinks' && latest.backlinks) {
				acc.latestBacklinks = {
					totalBacklinks: latest.backlinks.totalBacklinks,
					referringDomains: latest.backlinks.referringDomains,
					observedAt: latest.observedAt,
				};
				if (prior?.backlinks) {
					acc.priorBacklinks = {
						totalBacklinks: prior.backlinks.totalBacklinks,
						referringDomains: prior.backlinks.referringDomains,
						observedAt: prior.observedAt,
					};
				}
			}
			byCompetitor.set(latest.competitorId, acc);
			// `key` is the (competitor, source) tuple — included so a future
			// linter doesn't flag it as unused; the loop variable is required
			// by Map's iterator protocol.
			void key;
		}

		return [...byCompetitor.values()];
	}
}
