import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { RankingObservation } from '../entities/ranking-observation.js';
import type { Device } from '../value-objects/device.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

/**
 * #171 — one row per (tracked keyword) summarising its current rank AND
 * how it has moved vs ~1d and ~7d ago. The deltas use SEO convention:
 * negative = improvement (e.g. went from position 10 → 5 → delta -5),
 * positive = worsening. `null` deltas mean we don't have a historical
 * observation in the comparison window — typical for brand-new keywords.
 */
export interface ProjectRankingSnapshot {
	readonly trackedKeywordId: TrackedKeywordId;
	readonly phrase: string;
	readonly domain: string;
	readonly country: string;
	readonly language: string;
	readonly device: Device;
	readonly position: number | null;
	readonly url: string | null;
	readonly observedAt: Date;
	/** Position from the immediately preceding observation, regardless of how old. */
	readonly previousPosition: number | null;
	/** Position closest to ~24h before `observedAt` (≥20h gap). */
	readonly position1dAgo: number | null;
	/** Position closest to ~7d before `observedAt` (≥6d gap). */
	readonly position7dAgo: number | null;
	/** `position - position1dAgo`. Negative = improvement, positive = worsening, null if no comparison point. */
	readonly positionChange1d: number | null;
	readonly positionChange7d: number | null;
}

export interface RankingObservationRepository {
	save(observation: RankingObservation): Promise<void>;
	findLatestFor(trackedKeywordId: TrackedKeywordId): Promise<RankingObservation | null>;
	listForKeyword(
		trackedKeywordId: TrackedKeywordId,
		from: Date,
		to: Date,
	): Promise<readonly RankingObservation[]>;
	listLatestForProject(projectId: ProjectId): Promise<readonly RankingObservation[]>;
	/**
	 * #171 — latest snapshot per (tracked keyword) with 1d / 7d position
	 * deltas. Used by the `/projects/{pid}/rankings` endpoint so the daily
	 * health check can detect rank movements without accumulating its own
	 * snapshot history. One row per tracked keyword (deduplicated, ordered
	 * by latest `observedAt` descending).
	 */
	listProjectRankingsWithDeltas(projectId: ProjectId): Promise<readonly ProjectRankingSnapshot[]>;
}
