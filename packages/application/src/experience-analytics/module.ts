import type { ExperienceAnalytics as EXADomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { experienceAnalyticsAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { LinkClarityProjectUseCase } from './use-cases/link-clarity-project.use-case.js';
import { QueryExperienceHistoryUseCase } from './use-cases/query-experience-history.use-case.js';
import { RecordExperienceSnapshotUseCase } from './use-cases/record-experience-snapshot.use-case.js';
import { UnlinkClarityProjectUseCase } from './use-cases/unlink-clarity-project.use-case.js';

export interface ExperienceAnalyticsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly clarityProjectRepo: EXADomain.ClarityProjectRepository;
	readonly experienceSnapshotRepo: EXADomain.ExperienceSnapshotRepository;
	readonly experienceAnalyticsSchemaTables: readonly unknown[];
}

interface ExperienceSnapshotRow {
	observedDate: string;
	sessionsCount: number;
	botSessionsCount: number;
	distinctUserCount: number;
	pagesPerSession: number;
	rageClicks: number;
	deadClicks: number;
	avgEngagementSeconds: number;
	avgScrollDepth: number;
}

export const experienceAnalyticsModule: ContextModule = {
	id: 'experience-analytics',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as ExperienceAnalyticsDeps;
		const recordExperienceSnapshot = new RecordExperienceSnapshotUseCase(
			d.clarityProjectRepo,
			d.experienceSnapshotRepo,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				LinkClarityProject: new LinkClarityProjectUseCase(d.clarityProjectRepo, d.clock, d.ids, d.events),
				UnlinkClarityProject: new UnlinkClarityProjectUseCase(d.clarityProjectRepo, d.clock),
				QueryExperienceHistory: new QueryExperienceHistoryUseCase(
					d.clarityProjectRepo,
					d.experienceSnapshotRepo,
				),
				RecordExperienceSnapshot: recordExperienceSnapshot,
			},
			ingestUseCases: {
				'experience-analytics:record-experience-snapshot': {
					async execute({ rawPayloadId, rows, systemParams }) {
						const snap = rows[0] as ExperienceSnapshotRow | undefined;
						if (!snap) return;
						await recordExperienceSnapshot.execute({
							clarityProjectId: systemParams.clarityProjectId as string,
							observedDate: snap.observedDate,
							sessionsCount: snap.sessionsCount,
							botSessionsCount: snap.botSessionsCount,
							distinctUserCount: snap.distinctUserCount,
							pagesPerSession: snap.pagesPerSession,
							rageClicks: snap.rageClicks,
							deadClicks: snap.deadClicks,
							avgEngagementSeconds: snap.avgEngagementSeconds,
							avgScrollDepth: snap.avgScrollDepth,
							rawPayloadId,
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, experienceAnalyticsAutoScheduleConfigs),
			schemaTables: d.experienceAnalyticsSchemaTables,
		};
	},
};
