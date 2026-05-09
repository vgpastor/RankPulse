import type { CompetitorActivityObservation } from '../entities/competitor-activity-observation.js';
import type { CompetitorId, ProjectId } from '../value-objects/identifiers.js';

export interface CompetitorActivityRollupRow {
	readonly competitorId: CompetitorId;
	readonly latestObservedAt: Date | null;
	readonly latestWayback: {
		readonly snapshotCount: number;
		readonly latestSnapshotAt: Date | null;
		readonly observedAt: Date;
	} | null;
	readonly priorWayback: {
		readonly snapshotCount: number;
		readonly observedAt: Date;
	} | null;
	readonly latestBacklinks: {
		readonly totalBacklinks: number;
		readonly referringDomains: number;
		readonly observedAt: Date;
	} | null;
	readonly priorBacklinks: {
		readonly totalBacklinks: number;
		readonly referringDomains: number;
		readonly observedAt: Date;
	} | null;
}

export interface CompetitorActivityObservationRepository {
	/**
	 * Idempotent upsert: the aggregate's `observedAt` is start-of-day-UTC and
	 * the natural key is `(competitor_id, source, observed_at)` — re-runs on
	 * the same day overwrite the previous snapshot.
	 */
	save(observation: CompetitorActivityObservation): Promise<void>;

	/**
	 * Latest + prior observations per competitor in the project for both
	 * Wayback and Backlinks sources, used by the cockpit to compute
	 * delta-based activity scores. Returns one row per competitor (even
	 * if it has no observations yet — the row is mostly null).
	 */
	rollupForProject(projectId: ProjectId, windowDays: number): Promise<readonly CompetitorActivityRollupRow[]>;
}
