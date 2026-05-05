import type { Uuid } from '@rankpulse/shared';

export type Ga4PropertyId = Uuid & { readonly __kind: 'Ga4PropertyId' };
export type Ga4DailyMetricId = Uuid & { readonly __kind: 'Ga4DailyMetricId' };
