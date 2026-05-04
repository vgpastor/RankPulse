import type { Uuid } from '@rankpulse/shared';

export type OrganizationId = Uuid & { readonly __ctx?: 'OrganizationId' };
export type UserId = Uuid & { readonly __ctx?: 'UserId' };
export type MembershipId = Uuid & { readonly __ctx?: 'MembershipId' };
export type ApiTokenId = Uuid & { readonly __ctx?: 'ApiTokenId' };
