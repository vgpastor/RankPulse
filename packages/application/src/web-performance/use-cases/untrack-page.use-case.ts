import type { WebPerformance } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

/**
 * Hard-deletes the tracked page and (via the FK cascade) every snapshot
 * recorded for it. PSI snapshots are inexpensive to recompute if the
 * operator regrets — re-tracking the URL just starts a fresh history.
 */
export class UntrackPageUseCase {
	constructor(private readonly trackedPages: WebPerformance.TrackedPageRepository) {}

	async execute(trackedPageId: string): Promise<void> {
		const page = await this.trackedPages.findById(trackedPageId as WebPerformance.TrackedPageId);
		if (!page) throw new NotFoundError(`Tracked page ${trackedPageId} not found`);
		await this.trackedPages.delete(page.id);
	}
}
