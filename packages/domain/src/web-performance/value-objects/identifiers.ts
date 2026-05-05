import type { Uuid } from '@rankpulse/shared';

export type TrackedPageId = Uuid & { readonly __kind: 'TrackedPageId' };
