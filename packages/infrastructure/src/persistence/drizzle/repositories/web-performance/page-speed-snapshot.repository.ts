import { type ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { and, between, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { pageSpeedSnapshots } from '../../schema/index.js';

export class DrizzlePageSpeedSnapshotRepository implements WebPerformance.PageSpeedSnapshotRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(snapshot: WebPerformance.PageSpeedSnapshot): Promise<{ inserted: boolean }> {
		const result = await this.db
			.insert(pageSpeedSnapshots)
			.values({
				trackedPageId: snapshot.trackedPageId,
				projectId: snapshot.projectId,
				observedAt: snapshot.observedAt,
				lcpMs: snapshot.lcpMs,
				inpMs: snapshot.inpMs,
				cls: snapshot.cls,
				fcpMs: snapshot.fcpMs,
				ttfbMs: snapshot.ttfbMs,
				performanceScore: snapshot.performanceScore,
				seoScore: snapshot.seoScore,
				accessibilityScore: snapshot.accessibilityScore,
				bestPracticesScore: snapshot.bestPracticesScore,
			})
			.onConflictDoNothing({
				target: [pageSpeedSnapshots.trackedPageId, pageSpeedSnapshots.observedAt],
			})
			.returning({ trackedPageId: pageSpeedSnapshots.trackedPageId });
		return { inserted: result.length > 0 };
	}

	async listForPage(
		trackedPageId: WebPerformance.TrackedPageId,
		query: WebPerformance.PageSpeedSnapshotQuery,
	): Promise<readonly WebPerformance.PageSpeedSnapshot[]> {
		const rows = await this.db
			.select()
			.from(pageSpeedSnapshots)
			.where(
				and(
					eq(pageSpeedSnapshots.trackedPageId, trackedPageId),
					between(pageSpeedSnapshots.observedAt, query.from, query.to),
				),
			)
			.orderBy(pageSpeedSnapshots.observedAt);
		return rows.map((r) =>
			WebPerformance.PageSpeedSnapshot.rehydrate({
				trackedPageId: r.trackedPageId as WebPerformance.TrackedPageId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedAt: r.observedAt,
				lcpMs: r.lcpMs,
				inpMs: r.inpMs,
				cls: r.cls,
				fcpMs: r.fcpMs,
				ttfbMs: r.ttfbMs,
				performanceScore: r.performanceScore,
				seoScore: r.seoScore,
				accessibilityScore: r.accessibilityScore,
				bestPracticesScore: r.bestPracticesScore,
			}),
		);
	}
}
