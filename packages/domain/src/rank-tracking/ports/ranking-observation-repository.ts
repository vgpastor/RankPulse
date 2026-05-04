import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { RankingObservation } from '../entities/ranking-observation.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export interface RankingObservationRepository {
	save(observation: RankingObservation): Promise<void>;
	findLatestFor(trackedKeywordId: TrackedKeywordId): Promise<RankingObservation | null>;
	listForKeyword(
		trackedKeywordId: TrackedKeywordId,
		from: Date,
		to: Date,
	): Promise<readonly RankingObservation[]>;
	listLatestForProject(projectId: ProjectId): Promise<readonly RankingObservation[]>;
}
