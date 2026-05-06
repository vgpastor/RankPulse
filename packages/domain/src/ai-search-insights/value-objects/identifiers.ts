import type { Uuid } from '@rankpulse/shared';

export type BrandPromptId = Uuid & { readonly __kind: 'BrandPromptId' };
export type LlmAnswerId = Uuid & { readonly __kind: 'LlmAnswerId' };
