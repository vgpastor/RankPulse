import type { Uuid } from '@rankpulse/shared';

export type MonitoredDomainId = Uuid & { readonly __kind: 'MonitoredDomainId' };
