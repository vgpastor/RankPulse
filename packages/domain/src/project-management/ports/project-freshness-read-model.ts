import type { ProjectId } from '../value-objects/identifiers.js';

/**
 * #172 — observability summary. One snapshot per (project) summarising
 * when each upstream data subsystem last ingested. Lets the daily health
 * check answer "is everything fresh? what's stale?" with a single
 * round-trip instead of iterating each `/projects/{pid}/...` endpoint.
 */
export interface FreshnessTimestampedCount {
	readonly lastSeenAt: Date | null;
	readonly count: number;
}

export interface ProjectFreshnessSummary {
	readonly projectId: ProjectId;
	readonly checkedAt: Date;
	readonly sources: {
		readonly rankings: FreshnessTimestampedCount;
		readonly aiSearch: FreshnessTimestampedCount & { readonly providers: readonly string[] };
		readonly brandPrompts: { readonly activeCount: number; readonly pausedCount: number };
		readonly ga4: FreshnessTimestampedCount;
		readonly gsc: FreshnessTimestampedCount;
		readonly bing: FreshnessTimestampedCount;
		readonly pageSpeed: FreshnessTimestampedCount;
		readonly clarity: FreshnessTimestampedCount;
	};
}

export interface ProjectFreshnessReadModel {
	summarize(projectId: ProjectId): Promise<ProjectFreshnessSummary>;
}
