import type { Uuid } from '@rankpulse/shared';

export type GscPropertyId = Uuid & { readonly __kind: 'GscPropertyId' };
export type GscObservationId = Uuid & { readonly __kind: 'GscObservationId' };
