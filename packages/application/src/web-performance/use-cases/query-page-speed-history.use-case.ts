import type { WebPerformance } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface PageSpeedSnapshotView {
	observedAt: string;
	lcpMs: number | null;
	inpMs: number | null;
	cls: number | null;
	fcpMs: number | null;
	ttfbMs: number | null;
	performanceScore: number | null;
	seoScore: number | null;
	accessibilityScore: number | null;
	bestPracticesScore: number | null;
}

export interface QueryPageSpeedHistoryQuery {
	trackedPageId: string;
	from: Date;
	to: Date;
}

export class QueryPageSpeedHistoryUseCase {
	constructor(
		private readonly trackedPages: WebPerformance.TrackedPageRepository,
		private readonly snapshots: WebPerformance.PageSpeedSnapshotRepository,
	) {}

	async execute(q: QueryPageSpeedHistoryQuery): Promise<readonly PageSpeedSnapshotView[]> {
		const page = await this.trackedPages.findById(q.trackedPageId as WebPerformance.TrackedPageId);
		if (!page) throw new NotFoundError(`Tracked page ${q.trackedPageId} not found`);
		const rows = await this.snapshots.listForPage(page.id, { from: q.from, to: q.to });
		return rows.map((s) => ({
			observedAt: s.observedAt.toISOString(),
			lcpMs: s.lcpMs,
			inpMs: s.inpMs,
			cls: s.cls,
			fcpMs: s.fcpMs,
			ttfbMs: s.ttfbMs,
			performanceScore: s.performanceScore,
			seoScore: s.seoScore,
			accessibilityScore: s.accessibilityScore,
			bestPracticesScore: s.bestPracticesScore,
		}));
	}
}
