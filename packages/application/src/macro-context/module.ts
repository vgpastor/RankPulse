import type { MacroContext as MCDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { AddMonitoredDomainUseCase } from './use-cases/add-monitored-domain.use-case.js';
import { QueryRadarHistoryUseCase } from './use-cases/query-radar-history.use-case.js';
import { RemoveMonitoredDomainUseCase } from './use-cases/remove-monitored-domain.use-case.js';

export interface MacroContextDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly monitoredDomainRepo: MCDomain.MonitoredDomainRepository;
	readonly radarRankSnapshotRepo: MCDomain.RadarRankSnapshotRepository;
}

export const macroContextModule: ContextModule = {
	id: 'macro-context',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as MacroContextDeps;
		return {
			useCases: {
				AddMonitoredDomain: new AddMonitoredDomainUseCase(d.monitoredDomainRepo, d.clock, d.ids, d.events),
				RemoveMonitoredDomain: new RemoveMonitoredDomainUseCase(d.monitoredDomainRepo, d.clock),
				QueryRadarHistory: new QueryRadarHistoryUseCase(d.monitoredDomainRepo, d.radarRankSnapshotRepo),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
