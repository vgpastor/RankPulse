import type { Uuid } from '@rankpulse/shared';

export type WikipediaArticleId = Uuid & { readonly __kind: 'WikipediaArticleId' };
