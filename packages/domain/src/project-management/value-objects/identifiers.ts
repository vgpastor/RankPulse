import type { Uuid } from '@rankpulse/shared';

export type PortfolioId = Uuid & { readonly __ctx?: 'PortfolioId' };
export type ProjectId = Uuid & { readonly __ctx?: 'ProjectId' };
export type CompetitorId = Uuid & { readonly __ctx?: 'CompetitorId' };
export type KeywordListId = Uuid & { readonly __ctx?: 'KeywordListId' };
export type KeywordId = Uuid & { readonly __ctx?: 'KeywordId' };
