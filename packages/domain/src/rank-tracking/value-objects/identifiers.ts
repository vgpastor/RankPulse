import type { Uuid } from '@rankpulse/shared';

export type TrackedKeywordId = Uuid & { readonly __kind: 'TrackedKeywordId' };
export type RankingObservationId = Uuid & { readonly __kind: 'RankingObservationId' };
export type SerpObservationId = Uuid & { readonly __kind: 'SerpObservationId' };
export type RankedKeywordObservationId = Uuid & { readonly __kind: 'RankedKeywordObservationId' };
