export * from './error.js';
export * from './http-base.js';
export * from './manifest.js';
export * from './registry.js';
// AuthStrategy is intentionally re-exported from `./manifest.js` (the new
// discriminated union introduced in ADR 0002), shadowing the legacy string
// alias declared in `./types.js`. The legacy alias is unused outside of an
// inline comment in the pagespeed provider and will be deleted in Phase 7
// alongside the rest of the `Provider` interface. Until then, importers that
// need the old shape can reach into `./types.js` directly.
export type {
	EndpointCategory,
	EndpointDescriptor,
	FetchContext,
	Provider,
	RateLimitPolicy,
} from './types.js';
