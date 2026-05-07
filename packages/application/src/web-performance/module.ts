import type { SharedKernel, WebPerformance as WPDomain } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { webPerformanceAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { QueryPageSpeedHistoryUseCase } from './use-cases/query-page-speed-history.use-case.js';
import { RecordPageSpeedSnapshotUseCase } from './use-cases/record-page-speed-snapshot.use-case.js';
import { TrackPageUseCase } from './use-cases/track-page.use-case.js';
import { UntrackPageUseCase } from './use-cases/untrack-page.use-case.js';

export interface WebPerformanceDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly trackedPageRepo: WPDomain.TrackedPageRepository;
	readonly pageSpeedSnapshotRepo: WPDomain.PageSpeedSnapshotRepository;
	readonly webPerformanceSchemaTables: readonly unknown[];
}

interface PageSpeedSnapshotRow {
	observedAt: Date;
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

export const webPerformanceModule: ContextModule = {
	id: 'web-performance',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as WebPerformanceDeps;
		const recordPageSpeedSnapshot = new RecordPageSpeedSnapshotUseCase(
			d.trackedPageRepo,
			d.pageSpeedSnapshotRepo,
			d.events,
		);
		return {
			useCases: {
				TrackPage: new TrackPageUseCase(d.trackedPageRepo, d.clock, d.ids, d.events),
				UntrackPage: new UntrackPageUseCase(d.trackedPageRepo),
				QueryPageSpeedHistory: new QueryPageSpeedHistoryUseCase(d.trackedPageRepo, d.pageSpeedSnapshotRepo),
				RecordPageSpeedSnapshot: recordPageSpeedSnapshot,
			},
			ingestUseCases: {
				'web-performance:record-pagespeed-snapshot': {
					async execute({ rows, systemParams }) {
						const snap = rows[0] as PageSpeedSnapshotRow | undefined;
						if (!snap) return;
						await recordPageSpeedSnapshot.execute({
							trackedPageId: systemParams.trackedPageId as string,
							observedAt: snap.observedAt,
							lcpMs: snap.lcpMs,
							inpMs: snap.inpMs,
							cls: snap.cls,
							fcpMs: snap.fcpMs,
							ttfbMs: snap.ttfbMs,
							performanceScore: snap.performanceScore,
							seoScore: snap.seoScore,
							accessibilityScore: snap.accessibilityScore,
							bestPracticesScore: snap.bestPracticesScore,
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, webPerformanceAutoScheduleConfigs),
			schemaTables: d.webPerformanceSchemaTables,
		};
	},
};
