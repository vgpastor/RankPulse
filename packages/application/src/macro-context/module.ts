import type { MacroContext as MCDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { macroContextAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { AddMonitoredDomainUseCase } from './use-cases/add-monitored-domain.use-case.js';
import { QueryRadarHistoryUseCase } from './use-cases/query-radar-history.use-case.js';
import { RecordRadarRankUseCase } from './use-cases/record-radar-rank.use-case.js';
import { RemoveMonitoredDomainUseCase } from './use-cases/remove-monitored-domain.use-case.js';

export interface MacroContextDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly monitoredDomainRepo: MCDomain.MonitoredDomainRepository;
	readonly radarRankSnapshotRepo: MCDomain.RadarRankSnapshotRepository;
	readonly macroContextSchemaTables: readonly unknown[];
}

interface RadarRankSnapshotRow {
	observedDate: string;
	rank: number | null;
	bucket: string | null;
	categories: Record<string, number>;
}

export const macroContextModule: ContextModule = {
	id: 'macro-context',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as MacroContextDeps;
		const recordRadarRank = new RecordRadarRankUseCase(
			d.monitoredDomainRepo,
			d.radarRankSnapshotRepo,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				AddMonitoredDomain: new AddMonitoredDomainUseCase(d.monitoredDomainRepo, d.clock, d.ids, d.events),
				RemoveMonitoredDomain: new RemoveMonitoredDomainUseCase(d.monitoredDomainRepo, d.clock),
				QueryRadarHistory: new QueryRadarHistoryUseCase(d.monitoredDomainRepo, d.radarRankSnapshotRepo),
				RecordRadarRank: recordRadarRank,
			},
			ingestUseCases: {
				'macro-context:record-radar-rank': {
					async execute({ rawPayloadId, rows, systemParams }) {
						const snap = rows[0] as RadarRankSnapshotRow | undefined;
						if (!snap) return;
						await recordRadarRank.execute({
							monitoredDomainId: systemParams.monitoredDomainId as string,
							observedDate: snap.observedDate,
							rank: snap.rank,
							bucket: snap.bucket,
							categories: snap.categories,
							rawPayloadId,
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, macroContextAutoScheduleConfigs),
			schemaTables: d.macroContextSchemaTables,
		};
	},
};
