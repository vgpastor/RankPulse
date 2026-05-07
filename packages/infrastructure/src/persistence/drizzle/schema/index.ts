// Drizzle schema barrel: each bounded context owns its own table file under
// `./<context>.ts`. drizzle-kit 0.31.10 resolves cross-file `.js` ESM imports
// between sibling schema modules, so cross-context FKs (e.g. children →
// `organizations` / `projects`) are expressed as normal imports.
//
// Adding a new context:
//   1. Create `./<new-context>.ts` with table definitions.
//   2. Re-export from this file with `export * from './<new-context>.js';`.
//   3. Reference the tables from the context's `ContextModule.schemaTables`.

export * from './ai-search-insights.js';
export * from './bing-webmaster-insights.js';
export * from './engagement.js';
export * from './entity-awareness.js';
export * from './experience-analytics.js';
export * from './identity-access.js';
export * from './macro-context.js';
export * from './meta-ads-attribution.js';
export * from './project-management.js';
export * from './provider-connectivity.js';
export * from './rank-tracking.js';
export * from './search-console-insights.js';
export * from './traffic-analytics.js';
export * from './web-performance.js';
