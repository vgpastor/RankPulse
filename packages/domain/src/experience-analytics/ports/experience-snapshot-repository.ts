import type { ExperienceSnapshot } from '../entities/experience-snapshot.js';
import type { ClarityProjectId } from '../value-objects/identifiers.js';

export interface ExperienceSnapshotQuery {
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface ExperienceSnapshotRepository {
	/**
	 * Idempotent on (clarityProjectId, observedDate). Returns whether the
	 * write was a fresh insert or a no-op duplicate.
	 */
	save(snapshot: ExperienceSnapshot): Promise<{ inserted: boolean }>;
	listForClarityProject(
		clarityProjectId: ClarityProjectId,
		query: ExperienceSnapshotQuery,
	): Promise<readonly ExperienceSnapshot[]>;
}
