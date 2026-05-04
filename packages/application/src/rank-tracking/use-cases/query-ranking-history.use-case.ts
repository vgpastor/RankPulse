import type { RankTracking } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryRankingHistoryCommand {
	trackedKeywordId: string;
	from: Date;
	to: Date;
}

export interface RankingHistoryEntry {
	observedAt: string;
	position: number | null;
	url: string | null;
	serpFeatures: readonly string[];
	sourceProvider: string;
}

export class QueryRankingHistoryUseCase {
	constructor(
		private readonly trackedKeywords: RankTracking.TrackedKeywordRepository,
		private readonly observations: RankTracking.RankingObservationRepository,
	) {}

	async execute(cmd: QueryRankingHistoryCommand): Promise<RankingHistoryEntry[]> {
		const trackedId = cmd.trackedKeywordId as RankTracking.TrackedKeywordId;
		const tracked = await this.trackedKeywords.findById(trackedId);
		if (!tracked) {
			throw new NotFoundError(`TrackedKeyword ${cmd.trackedKeywordId} not found`);
		}
		const series = await this.observations.listForKeyword(trackedId, cmd.from, cmd.to);
		return series.map((o) => ({
			observedAt: o.observedAt.toISOString(),
			position: o.position.value,
			url: o.url,
			serpFeatures: o.serpFeatures,
			sourceProvider: o.sourceProvider,
		}));
	}
}
