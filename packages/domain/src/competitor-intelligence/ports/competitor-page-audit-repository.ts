import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { CompetitorPageAudit } from '../entities/competitor-page-audit.js';

export interface ListCompetitorPageAuditsOptions {
	/**
	 * If supplied, returns the single most recent audit for that exact URL
	 * within the (project, competitorDomain) tuple. If omitted, returns the
	 * latest audit per URL across the competitor (one row per URL, picking the
	 * most recent observation for each).
	 */
	url?: string;
	/** Caps row count when listing latest-per-url. Defaults to 500. */
	limit?: number;
}

export interface CompetitorPageAuditRepository {
	/**
	 * Bulk insert with `onConflictDoNothing` against the natural key
	 * `(observed_at, project_id, competitor_domain, url)`. `inserted` reports
	 * rows attempted (Drizzle on postgres-js does not surface affected counts
	 * on `onConflictDoNothing`), matching the `CompetitorKeywordGapRepository`
	 * convention.
	 */
	saveAll(audits: readonly CompetitorPageAudit[]): Promise<{ inserted: number }>;

	/**
	 * Latest snapshot for a competitor's audited pages within the project.
	 * - With `opts.url`: returns at most one row — the latest audit for that URL.
	 * - Without `opts.url`: returns the latest audit per URL (one row per URL),
	 *   ordered by observed_at DESC.
	 */
	listLatestForCompetitor(
		projectId: ProjectId,
		competitorDomain: string,
		opts?: ListCompetitorPageAuditsOptions,
	): Promise<readonly CompetitorPageAudit[]>;
}
