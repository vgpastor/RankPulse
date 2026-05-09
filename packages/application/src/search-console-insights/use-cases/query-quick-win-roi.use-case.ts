import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import { ctrForPosition } from '../lib/ctr-curve.js';

export interface QueryQuickWinRoiCommand {
	projectId: string;
	windowDays?: number;
	minImpressions?: number;
	limit?: number;
}

export interface QuickWinRoiDto {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	currentPosition: number;
	projectedClickGain: number;
	roiScore: number;
}

export interface QueryQuickWinRoiResponse {
	rows: QuickWinRoiDto[];
}

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_MIN_IMPRESSIONS = 100;
const DEFAULT_LIMIT = 25;
const QUICK_WIN_MIN_POS = 11;
const QUICK_WIN_MAX_POS = 30;
const TOP_POSITION_FOR_ROI = 10;

/**
 * Quick-Win ROI: keywords currently ranking #11-#30 sorted by the projected
 * click gain if they crossed into the first page (target = #10).
 *
 * The issue's formula is `vol × Δ-CTR × CR`. The CR factor (conversion rate
 * per query) requires GA4 conversions joined with GSC keyword data — that's
 * a separate sub-issue. The MVP returns the volume × Δ-CTR component
 * (= projected CLICK gain) so the user can rank by what's most impactful
 * at the search-funnel layer; downstream conversion modelling is a layer
 * the operator adds in their head until the GA4 join lands.
 *
 * Differs from `QueryLostOpportunityUseCase` only in the position filter
 * (11-30 vs all > target) and the default `limit` (smaller, this view is
 * "what to ship next week", not "what's wrong everywhere").
 */
export class QueryQuickWinRoiUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly cockpit: SearchConsoleInsights.GscCockpitReadModel,
	) {}

	async execute(cmd: QueryQuickWinRoiCommand): Promise<QueryQuickWinRoiResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const windowDays = cmd.windowDays ?? DEFAULT_WINDOW_DAYS;
		const minImpressions = Math.max(1, cmd.minImpressions ?? DEFAULT_MIN_IMPRESSIONS);
		const limit = clampInt(cmd.limit ?? DEFAULT_LIMIT, 1, 100);
		const targetCtrPct = ctrForPosition(TOP_POSITION_FOR_ROI);

		const rows = await this.cockpit.aggregateByQuery(projectId, windowDays, {
			minImpressions,
			limit: 2000,
		});

		const out: QuickWinRoiDto[] = [];
		for (const r of rows) {
			if (r.avgPosition < QUICK_WIN_MIN_POS || r.avgPosition > QUICK_WIN_MAX_POS) continue;
			const currentCtrPct = ctrForPosition(r.avgPosition);
			const deltaCtrPct = targetCtrPct - currentCtrPct;
			if (deltaCtrPct <= 0) continue;
			const projectedGain = r.totalImpressions * (deltaCtrPct / 100);
			// ROI score: scale projected gain by inverse-position so closer-to-page-1
			// keywords (which are cheaper to push) outrank deep ones with the same
			// projected gain. A keyword at #12 with 100 projected clicks beats a
			// keyword at #28 with 100 projected clicks.
			const roiScore = (projectedGain * (31 - r.avgPosition)) / 20;
			out.push({
				query: r.query,
				page: r.bestPage,
				impressions: r.totalImpressions,
				clicks: r.totalClicks,
				currentPosition: Number(r.avgPosition.toFixed(2)),
				projectedClickGain: Math.round(projectedGain),
				roiScore: Number(roiScore.toFixed(2)),
			});
		}
		out.sort((a, b) => b.roiScore - a.roiScore);
		return { rows: out.slice(0, limit) };
	}
}

const clampInt = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));
