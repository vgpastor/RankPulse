import type { EntityAwareness as EADomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { LinkWikipediaArticleUseCase } from './use-cases/link-wikipedia-article.use-case.js';
import { QueryWikipediaPageviewsUseCase } from './use-cases/query-wikipedia-pageviews.use-case.js';
import { UnlinkWikipediaArticleUseCase } from './use-cases/unlink-wikipedia-article.use-case.js';

export interface EntityAwarenessDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly wikipediaArticleRepo: EADomain.WikipediaArticleRepository;
	readonly wikipediaPageviewRepo: EADomain.WikipediaPageviewObservationRepository;
}

export const entityAwarenessModule: ContextModule = {
	id: 'entity-awareness',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as EntityAwarenessDeps;
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
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
