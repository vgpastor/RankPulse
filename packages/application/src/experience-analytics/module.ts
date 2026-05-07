import type { ExperienceAnalytics as EXADomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { LinkClarityProjectUseCase } from './use-cases/link-clarity-project.use-case.js';
import { QueryExperienceHistoryUseCase } from './use-cases/query-experience-history.use-case.js';
import { UnlinkClarityProjectUseCase } from './use-cases/unlink-clarity-project.use-case.js';

export interface ExperienceAnalyticsDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly clarityProjectRepo: EXADomain.ClarityProjectRepository;
	readonly experienceSnapshotRepo: EXADomain.ExperienceSnapshotRepository;
}

export const experienceAnalyticsModule: ContextModule = {
	id: 'experience-analytics',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as ExperienceAnalyticsDeps;
		return {
			useCases: {
				LinkClarityProject: new LinkClarityProjectUseCase(d.clarityProjectRepo, d.clock, d.ids, d.events),
				UnlinkClarityProject: new UnlinkClarityProjectUseCase(d.clarityProjectRepo, d.clock),
				QueryExperienceHistory: new QueryExperienceHistoryUseCase(
					d.clarityProjectRepo,
					d.experienceSnapshotRepo,
				),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
