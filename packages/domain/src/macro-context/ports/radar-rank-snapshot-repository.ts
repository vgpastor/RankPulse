import type { RadarRankSnapshot } from '../entities/radar-rank-snapshot.js';
import type { MonitoredDomainId } from '../value-objects/identifiers.js';

export interface RadarRankSnapshotQuery {
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface RadarRankSnapshotRepository {
	/**
	 * Idempotent on the natural key (monitored_domain_id, observed_date).
	 * Returns inserted count so the use case can publish accurate metrics.
	 */
	save(snapshot: RadarRankSnapshot): Promise<{ inserted: boolean }>;
	listForDomain(
		monitoredDomainId: MonitoredDomainId,
		query: RadarRankSnapshotQuery,
	): Promise<readonly RadarRankSnapshot[]>;
}
