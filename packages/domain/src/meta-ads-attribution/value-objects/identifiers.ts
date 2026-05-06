import type { Uuid } from '@rankpulse/shared';

export type MetaPixelId = Uuid & { readonly __kind: 'MetaPixelId' };
export type MetaAdAccountId = Uuid & { readonly __kind: 'MetaAdAccountId' };
