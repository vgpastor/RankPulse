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
	backlinks: {
		totalBacklinks: number;
		referringDomains: number;
		observedAt: string;
		deltaBacklinks: number | null;
		deltaReferringDomains: number | null;
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
 * competitor. The activity score combines two normalised signals:
 *
 *   - Wayback snapshot delta (latest count − prior count) — proxy for
 *     "they are shipping site changes".
 *   - Backlinks delta (latest total − prior total) — proxy for
 *     "they are running outreach / content gaining links".
 *
 * Both are zero-clamped (we don't reward decreases) and normalised by the
 * project-wide maximum so the cockpit can render a 0-100 bar without
 * needing to know absolute numbers.
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
			const latestBacklinks = rollup?.latestBacklinks ?? null;
			const priorBacklinks = rollup?.priorBacklinks ?? null;

			const deltaSnapshots =
				latestWayback && priorWayback ? latestWayback.snapshotCount - priorWayback.snapshotCount : null;
			const deltaBacklinks =
				latestBacklinks && priorBacklinks
					? latestBacklinks.totalBacklinks - priorBacklinks.totalBacklinks
					: null;
			const deltaReferringDomains =
				latestBacklinks && priorBacklinks
					? latestBacklinks.referringDomains - priorBacklinks.referringDomains
					: null;

			const waybackSignal = Math.max(deltaSnapshots ?? 0, 0);
			const backlinksSignal = Math.max(deltaBacklinks ?? 0, 0);

			return {
				competitorId: competitor.id,
				domain: competitor.domain.value,
				label: competitor.label,
				latestObservedAt: rollup?.latestObservedAt ?? null,
				latestWayback,
				priorWayback,
				latestBacklinks,
				priorBacklinks,
				deltaSnapshots,
				deltaBacklinks,
				deltaReferringDomains,
				waybackSignal,
				backlinksSignal,
			};
		});

		// Normalise per signal so a competitor with 200k backlinks doesn't
		// dwarf one with 12 new wayback snapshots — we want the activity bar
		// to highlight the most-active rival across either dimension.
		const maxWayback = Math.max(0, ...rawRows.map((r) => r.waybackSignal));
		const maxBacklinks = Math.max(0, ...rawRows.map((r) => r.backlinksSignal));

		const rows: CompetitorActivityRowDto[] = rawRows.map((r) => {
			const waybackNormalised = maxWayback === 0 ? 0 : r.waybackSignal / maxWayback;
			const backlinksNormalised = maxBacklinks === 0 ? 0 : r.backlinksSignal / maxBacklinks;
			const activityScore = Math.round((waybackNormalised + backlinksNormalised) * 50);

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
				backlinks: r.latestBacklinks
					? {
							totalBacklinks: r.latestBacklinks.totalBacklinks,
							referringDomains: r.latestBacklinks.referringDomains,
							observedAt: r.latestBacklinks.observedAt.toISOString(),
							deltaBacklinks: r.deltaBacklinks,
							deltaReferringDomains: r.deltaReferringDomains,
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
