import type { EntityAwareness as EADomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import { buildAutoScheduleHandlers } from '../_core/auto-schedule.js';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { entityAwarenessAutoScheduleConfigs } from './event-handlers/auto-schedule.config.js';
import { IngestWikipediaPageviewsUseCase } from './use-cases/ingest-wikipedia-pageviews.use-case.js';
import { LinkWikipediaArticleUseCase } from './use-cases/link-wikipedia-article.use-case.js';
import { QueryWikipediaPageviewsUseCase } from './use-cases/query-wikipedia-pageviews.use-case.js';
import { UnlinkWikipediaArticleUseCase } from './use-cases/unlink-wikipedia-article.use-case.js';

export interface EntityAwarenessDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly wikipediaArticleRepo: EADomain.WikipediaArticleRepository;
	readonly wikipediaPageviewRepo: EADomain.WikipediaPageviewObservationRepository;
	readonly entityAwarenessSchemaTables: readonly unknown[];
}

export const entityAwarenessModule: ContextModule = {
	id: 'entity-awareness',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as EntityAwarenessDeps;
		const ingestWikipediaPageviews = new IngestWikipediaPageviewsUseCase(
			d.wikipediaArticleRepo,
			d.wikipediaPageviewRepo,
			d.events,
			d.clock,
		);
		return {
			useCases: {
				LinkWikipediaArticle: new LinkWikipediaArticleUseCase(
					d.wikipediaArticleRepo,
					d.clock,
					d.ids,
					d.events,
				),
				UnlinkWikipediaArticle: new UnlinkWikipediaArticleUseCase(d.wikipediaArticleRepo, d.clock, d.events),
				QueryWikipediaPageviews: new QueryWikipediaPageviewsUseCase(
					d.wikipediaArticleRepo,
					d.wikipediaPageviewRepo,
				),
				IngestWikipediaPageviews: ingestWikipediaPageviews,
			},
			ingestUseCases: {
				'entity-awareness:ingest-wikipedia-pageviews': {
					async execute({ rows, systemParams }) {
						await ingestWikipediaPageviews.execute({
							articleId: systemParams.wikipediaArticleId as string,
							rows: rows as Parameters<typeof ingestWikipediaPageviews.execute>[0]['rows'],
						});
					},
				},
			},
			eventHandlers: buildAutoScheduleHandlers(deps, entityAwarenessAutoScheduleConfigs),
			schemaTables: d.entityAwarenessSchemaTables,
		};
	},
};
