# ADR 0002 — Provider Extension Platform (declarative manifests + context modules)

- **Status:** Proposed
- **Date:** 2026-05-06
- **Companion design doc:** [`docs/superpowers/specs/2026-05-06-provider-extension-platform-design.md`](../superpowers/specs/2026-05-06-provider-extension-platform-design.md)
- **Builds on:** ADR 0001 (eliminate SystemParamResolver via auto-schedule handlers).
- **Bounded contexts touched:** all (cross-cutting refactor).

## Context

ADR 0001 retired the `SystemParamResolver` mechanical fix and introduced per-context auto-schedule handlers. With that change in place, a 6-dimension architectural audit of the codebase (2026-05-06) surfaced a single dominant problem: **every extension is transversal**.

Adding a new provider today touches:

- A new provider package (correct).
- A new `<X>ApiError extends Error` (~50 LOC of boilerplate, 14 such classes today).
- A new `http.ts` (~100 LOC, ~70% duplicated across providers).
- A new auto-schedule handler per `XLinked` event (~80 LOC each, ~80% duplicated, 10 such handlers today).
- A new dispatch block in the worker's 818-LOC `provider-fetch.processor.ts` if-else chain.
- A new wiring block in the 793-LOC `composition-root.ts` AND a duplicated wiring block in the 290-LOC `apps/worker/src/main.ts`.
- A new fragment in the 1175-LOC monolithic `schema/index.ts`.
- A new repository class with `~80 LOC` of patterns shared with 37 other repos.

The audit reports converged on the same conclusion: every metric points to **linear-scale extension cost** as the single biggest impediment to adding the next 10–20 providers in the project's roadmap.

## Decision

Adopt a declarative manifest pattern across two axes:

1. **`ProviderManifest`** (new, in `provider-core`) — pure data + pure functions describing a provider: HTTP config, auth strategy, endpoints, ACL functions, ingest bindings (token + systemParam key + ACL). Replaces the existing `Provider` interface. Lives in the provider package's `manifest.ts`.

2. **`ContextModule`** (new, in a new `application/core` location) — factory function `compose(deps: SharedDeps): ContextRegistrations` exposing the bounded context's repos, use cases, ingest use cases (keyed for resolution by `ProviderManifest.ingest.useCaseKey`), event handlers, and schema tables. Lives in the context's application package.

The composition root iterates `[allManifests]` and `[allModules].map(m => m.compose(sharedDeps))`, building:

- A `ProviderRegistry` from manifests.
- A merged `ingestUseCases: Record<string, IngestUseCase>` from modules.
- An `IngestRouter` (worker) that maps `(providerId, endpointId) → { systemParamKey, acl, ingest }`.
- An event-bus subscription per handler.
- The NestJS provider list for the API.

The worker's bootstrap (`apps/worker/src/main.ts`) uses the same `SharedDeps` factory and the same module list — no more duplicated wiring across api/worker.

Five sub-projects deliver the change in one PR with ordered commits:

- **A1** Provider HTTP foundation: `BaseHttpClient` + `ProviderApiError` (discriminated by `providerId`).
- **A2** Auto-Schedule Handler Registry: 10 standalone handler files collapse to config entries inside each `ContextModule.compose`, dispatched by a generic `buildAutoScheduleHandlers` factory.
- **A3** Worker Processor → Ingest Router: 818-LOC processor shrinks to ~250 LOC; the 12 if-else dispatch blocks become a `Map` lookup inside `IngestRouter.dispatch`.
- **A4** composition-root + worker main modularization: both shrink to ~150 LOC iterating manifests/modules.
- **A5** Persistence cleanup: split `schema/index.ts` per context (drizzle-kit detects no diff); extract `DrizzleRepository<T>` base for the universal `findById` pattern.

## Consequences

### Positive

- **Adding a provider drops to one package + one line in `manifests.ts`.** Confirmed by the design's acceptance criterion: a hypothetical "Provider X" requires only a new package with a `ProviderManifest` plus one entry in the registry array.
- **Composition root and worker main converge.** Both use the same `SharedDeps` and module iteration — eliminates the ~95% duplication between `apps/api/src/composition/composition-root.ts` and `apps/worker/src/main.ts`.
- **Worker processor's 12 if-else dispatch blocks disappear.** The `IngestRouter` is built once at composition time from manifest data; the processor calls `ingestRouter.dispatch(...)` and is done.
- **DDD layering is preserved.** The provider package stays in the provider layer (HTTP + descriptors + ACL functions). The context module stays in the application layer (repos + use cases + handlers). The composition root remains the only place that crosses layer boundaries — by design, as today.
- **Test coverage is naturally extended.** Each new abstraction comes with unit tests; the missing Testcontainers harness is set up as a side-effect of testing `DrizzleRepository.findById`. Closes PR #86's deferred Task 8.1 follow-up.

### Negative

- **Long-lived branch (~3 weeks).** Mitigated by ordered commits keeping the branch always-buildable, weekly rebase on main, and subagent review per task.
- **New abstraction to absorb.** Contributors learn `ProviderManifest` and `ContextModule`. CLAUDE.md § 7 ("Cómo añadir cosas") and a new `docs/recipes/adding-a-provider.md` walkthrough cover the learning curve.
- **`Provider` interface deprecated and removed.** The `provider-core/types.ts` `Provider` interface and its `discover()` method are superseded by `ProviderManifest`. Existing per-provider classes are retired during the refactor. No external consumer relies on the `Provider` shape (verified — only `provider-core/registry.ts` imports it, and that's part of this refactor).

### Out of scope

- **OpenAPI auto-derivation** from Zod schemas (Tema C) — separate ADR will follow.
- **Outbox pattern** for cross-process events (Tema D) — separate ADR; the audit identified this as an architectural debt to be addressed when horizontal scaling becomes a real constraint.
- **Frontend templates** (Tema E) — coordinates with PR #84 (currently draft).

## Acceptance criteria (high-level)

The merge gate is the design doc's acceptance-criteria checklist. Highlights:

- All 14 providers export `ProviderManifest`; all 13 contexts export `ContextModule`.
- `composition-root.ts` < 200 LOC; `apps/worker/src/main.ts` < 150 LOC; `provider-fetch.processor.ts` < 300 LOC.
- All `<X>ApiError` classes (14) deleted; all standalone `auto-schedule-on-*.handler.ts` files (10) deleted.
- Schema split per context with zero migration diff.
- All 220+ existing tests pass; new tests cover the new abstractions; at least 3 integration scenarios with Testcontainers.
- `CLAUDE.md` § 7 updated; this ADR + design doc + recipe walkthrough committed.

## Alternatives considered

### Module pattern à la NestJS (Option β)

Each context exports a class with a `compose()` method. Provider manifests stay as data. Composition iterates module instances.

Rejected because: the function-as-module pattern (`compose(deps): registrations`) gives the same outcome with less ceremony, and matches the codebase's existing functional style (no abuse of OOP for things that are factories).

### Foundation classes only (Option γ)

Extract `BaseHttpClient`, `ProviderApiError`, `AutoScheduleHandlerFactory`, `DrizzleRepository<T>`, `IngestRouter` interfaces; keep imperative wiring in composition-root.

Rejected because: each provider still touches 5–7 files; the "linear scale" problem the audit surfaced is not solved. Lower risk, but the project's stated goal is to scale to many more providers, justifying the larger investment of Option α (the chosen approach).

### Mega-manifest mixing layers (Option 2 from brainstorm)

Single manifest per context bundles provider HTTP + domain repos + application use cases + infrastructure adapters.

Rejected because: it violates DDD layering (would force the manifest file to import from infrastructure, breaking the rule in CLAUDE.md § 3). The two-axis split (provider manifest + context module) keeps each artifact within one layer.

## References

- Issue [#93](https://github.com/vgpastor/RankPulse/issues/93) — tracking the refactor.
- ADR 0001 — Eliminate SystemParamResolver via auto-schedule handlers.
- Design doc — `docs/superpowers/specs/2026-05-06-provider-extension-platform-design.md`.
- 6-dimension architectural audit (2026-05-06) — informed this decision.
- PR #86 (closed issue #56) — original architectural fix that surfaced the manifest opportunity.
- PR #90 (closed issue #89) — Meta migration completing ADR 0001.
