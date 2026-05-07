import type { SharedKernel } from '@rankpulse/domain';

/**
 * Bounded-context contribution to composition. Each context exports a
 * `ContextModule` from its application bounded-context (e.g.
 * `packages/application/src/meta-ads-attribution/module.ts`). The
 * composition root iterates all modules and wires their registrations.
 *
 * Why a factory function and not a static manifest: the compose step
 * builds repos from `deps.drizzle`, instantiates use cases with their
 * dependencies, and constructs auto-schedule handlers. None of that can
 * live in pure data without losing type safety on dependency wiring.
 *
 * See ADR 0002.
 */
export interface ContextModule {
	readonly id: string;
	compose(deps: SharedDeps): ContextRegistrations;
}

export interface ContextRegistrations {
	/**
	 * Use cases exposed under DI tokens for controllers + other consumers.
	 * The composition root reads this map and registers each entry under
	 * its corresponding token. Keys MUST match the token's symbol description.
	 */
	readonly useCases: Record<string, unknown>;
	/**
	 * Subset of use cases that ProviderManifest's IngestBinding looks up.
	 * Keys match `IngestBinding.useCaseKey` (e.g. 'meta:pixel-events-ingest').
	 */
	readonly ingestUseCases: Record<string, IngestUseCase>;
	/** Auto-schedule handlers + future domain-event subscribers. */
	readonly eventHandlers: readonly EventHandler[];
	/**
	 * Drizzle table definitions owned by this context. Collected during
	 * Phase 2 (schema split). Informational today; future use for
	 * per-context test schema bootstrapping or partial migrations.
	 */
	readonly schemaTables: readonly unknown[];
}

export interface IngestUseCase {
	execute(input: {
		rawPayloadId: string;
		rows: unknown[];
		systemParams: Record<string, unknown>;
	}): Promise<void>;
}

export interface EventHandler {
	readonly events: readonly string[];
	handle(event: SharedKernel.DomainEvent): Promise<void>;
}

/**
 * Shape of the dependencies composition injects into every ContextModule.
 * The actual SharedDeps interface lives in `apps/api/src/composition/shared-deps.ts`
 * (it depends on infrastructure types we can't import here without a circular
 * dependency). This type alias is opaque to keep modules layer-pure.
 */
export interface SharedDeps {
	readonly _brand: 'SharedDeps';
	readonly [key: string]: unknown;
}
