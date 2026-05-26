import type { ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryCompetitorActivityCommand {
	projectId: string;
	windowDays?: number;
}

export interface CompetitorActivityRowDto {
	competitorId: string;
	domain: string;
	label: string;
	latestObservedAt: string | null;
	wayback: {
		snapshotCount: number;
		latestSnapshotAt: string | null;
		observedAt: string;
		deltaSnapshots: number | null;
	} | null;
	activityScore: number;
}

export interface QueryCompetitorActivityResponse {
	rows: CompetitorActivityRowDto[];
	maxScore: number;
}

const DEFAULT_WINDOW_DAYS = 60;

/**
 * Aggregates the latest competitor-activity observations into one row per
 * competitor. The activity score is derived from a single normalised
 * signal:
 *
 *   - Wayback snapshot delta (latest count − prior count) — proxy for
 *     "they are shipping site changes".
 *
 * Backlinks delta was dropped in the #179 follow-up: DataForSEO Backlinks
 * API requires a paid subscription on top of the pay-as-you-go balance
 * (~$100/mo) and the radar's job is to detect *activity*, not absolute
 * link counts. The wayback signal captures the same "competitor is
 * shipping" intent without recurring cost. If/when a cheaper backlinks
 * source ships (SE Ranking, Common Crawl), re-introduce a second signal
 * and blend the weights here.
 *
 * The signal is zero-clamped (we don't reward decreases) and normalised
 * by the project-wide maximum so the cockpit can render a 0-100 bar
 * without needing to know absolute numbers.
 */
export class QueryCompetitorActivityUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly observations: ProjectManagement.CompetitorActivityObservationRepository,
	) {}

	async execute(cmd: QueryCompetitorActivityCommand): Promise<QueryCompetitorActivityResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const windowDays = cmd.windowDays ?? DEFAULT_WINDOW_DAYS;

		const competitors = await this.competitors.listForProject(projectId);
		if (competitors.length === 0) {
			return { rows: [], maxScore: 0 };
		}
		const rollups = await this.observations.rollupForProject(projectId, windowDays);
		const rollupByCompetitor = new Map(rollups.map((r) => [r.competitorId, r]));

		const rawRows = competitors.map((competitor) => {
			const rollup = rollupByCompetitor.get(competitor.id);
			const latestWayback = rollup?.latestWayback ?? null;
			const priorWayback = rollup?.priorWayback ?? null;

			const deltaSnapshots =
				latestWayback && priorWayback ? latestWayback.snapshotCount - priorWayback.snapshotCount : null;
			const waybackSignal = Math.max(deltaSnapshots ?? 0, 0);

			return {
				competitorId: competitor.id,
				domain: competitor.domain.value,
				label: competitor.label,
				latestObservedAt: rollup?.latestObservedAt ?? null,
				latestWayback,
				deltaSnapshots,
				waybackSignal,
			};
		});

		// Normalise the wayback signal across competitors so the most-active
		// rival anchors the 100 mark and the rest read as a relative %.
		const maxWayback = Math.max(0, ...rawRows.map((r) => r.waybackSignal));

		const rows: CompetitorActivityRowDto[] = rawRows.map((r) => {
			const waybackNormalised = maxWayback === 0 ? 0 : r.waybackSignal / maxWayback;
			const activityScore = Math.round(waybackNormalised * 100);

			return {
				competitorId: r.competitorId,
				domain: r.domain,
				label: r.label,
				latestObservedAt: r.latestObservedAt ? r.latestObservedAt.toISOString() : null,
				wayback: r.latestWayback
					? {
							snapshotCount: r.latestWayback.snapshotCount,
							latestSnapshotAt: r.latestWayback.latestSnapshotAt
								? r.latestWayback.latestSnapshotAt.toISOString()
								: null,
							observedAt: r.latestWayback.observedAt.toISOString(),
							deltaSnapshots: r.deltaSnapshots,
						}
					: null,
				activityScore,
			};
		});

		rows.sort((a, b) => b.activityScore - a.activityScore);
		const maxScore = rows.length === 0 ? 0 : (rows[0]?.activityScore ?? 0);
		return { rows, maxScore };
	}
}
