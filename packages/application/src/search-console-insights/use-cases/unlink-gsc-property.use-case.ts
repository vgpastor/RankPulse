import type { SearchConsoleInsights } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface UnlinkGscPropertyCommand {
	gscPropertyId: string;
}

export interface UnlinkGscPropertyResult {
	unlinked: boolean;
}

/**
 * Soft-unlink a GSC property: stamps `unlinked_at = clock.now()`.
 *
 * Effect:
 *   - `IngestGscRowsUseCase` already short-circuits with `if
 *     (!property.isActive()) return` so post-unlink ingest is a no-op.
 *   - The property row stays in BD so historical observations remain
 *     queryable. Operators can still see the property in the SPA list
 *     (rendered as "unlinked" if/when the UI surfaces that state).
 *
 * Idempotent: re-unlinking throws ConflictError from the entity. The
 * controller maps it to 409 — semantically "the property was already
 * unlinked, no-op".
 */
export class UnlinkGscPropertyUseCase {
	constructor(
		private readonly properties: SearchConsoleInsights.GscPropertyRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: UnlinkGscPropertyCommand): Promise<UnlinkGscPropertyResult> {
		const property = await this.properties.findById(cmd.gscPropertyId as SearchConsoleInsights.GscPropertyId);
		if (!property) {
			throw new NotFoundError(`GscProperty ${cmd.gscPropertyId} not found`);
		}
		property.unlink(this.clock.now());
		await this.properties.save(property);
		return { unlinked: true };
	}
}
