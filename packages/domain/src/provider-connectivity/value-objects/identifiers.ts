import type { Uuid } from '@rankpulse/shared';

export type ProviderCredentialId = Uuid & { readonly __kind: 'ProviderCredentialId' };
export type ProviderJobDefinitionId = Uuid & { readonly __kind: 'ProviderJobDefinitionId' };
export type ProviderJobRunId = Uuid & { readonly __kind: 'ProviderJobRunId' };
export type RawPayloadId = Uuid & { readonly __kind: 'RawPayloadId' };
export type ApiUsageEntryId = Uuid & { readonly __kind: 'ApiUsageEntryId' };
