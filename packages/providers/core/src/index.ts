export * from './error.js';
export * from './http-base.js';
export * from './manifest.js';
export * from './manifest-registry.js';
// `AuthStrategy` is the discriminated union from `./manifest.js`. The
// legacy string-union version + `Provider` class interface +
// `ProviderRegistry` were deleted in Phase 7b of ADR 0002. The remaining
// re-exports are the manifest-agnostic shared types.
export type { EndpointCategory, EndpointDescriptor, FetchContext, RateLimitPolicy } from './types.js';
