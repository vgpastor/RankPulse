import type {
	CompetitorIntelligence as CIDomain,
	ProjectManagement as PMDomain,
	SharedKernel,
} from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { IngestDomainIntersectionUseCase } from './use-cases/ingest-domain-intersection.use-case.js';
import { QueryKeywordGapsUseCase } from './use-cases/query-keyword-gaps.use-case.js';

export interface CompetitorIntelligenceDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly projectRepo: PMDomain.ProjectRepository;
	readonly competitorKeywordGapRepo: CIDomain.CompetitorKeywordGapRepository;
	readonly competitorIntelligenceSchemaTables: readonly unknown[];
}

export const competitorIntelligenceModule: ContextModule = {
	id: 'competitor-intelligence',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as CompetitorIntelligenceDeps;
		const ingestDomainIntersection = new IngestDomainIntersectionUseCase(
			d.projectRepo,
			d.competitorKeywordGapRepo,
			d.ids,
		);
		return {
			useCases: {
				IngestDomainIntersection: ingestDomainIntersection,
				QueryKeywordGaps: new QueryKeywordGapsUseCase(d.projectRepo, d.competitorKeywordGapRepo),
			},
			ingestUseCases: {
				// Issue #128: typed ingest path. The router's generic envelope
				// carries `ourDomain` and `competitorDomain` (validated by the
				// manifest's ACL) plus `projectId` stamped at scheduling time.
				// `country`/`language` fall through from `endpointParams`.
				'competitor-intelligence:ingest-domain-intersection': {
					async execute({ rawPayloadId, rows, systemParams }) {
						await ingestDomainIntersection.execute({
							projectId: systemParams.projectId as string,
							ourDomain: systemParams.ourDomain as string,
							competitorDomain: systemParams.competitorDomain as string,
							country: (systemParams.country as string | undefined) ?? '',
							language: (systemParams.language as string | undefined) ?? '',
							rawPayloadId,
							rows: rows as Parameters<typeof ingestDomainIntersection.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: [],
			schemaTables: d.competitorIntelligenceSchemaTables,
		};
	},
};
