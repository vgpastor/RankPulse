import { ExperienceAnalytics, type ProjectManagement } from '@rankpulse/domain';
import { and, between, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { clarityDailyMetrics } from '../../schema/index.js';

export class DrizzleExperienceSnapshotRepository implements ExperienceAnalytics.ExperienceSnapshotRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(snapshot: ExperienceAnalytics.ExperienceSnapshot): Promise<{ inserted: boolean }> {
		const result = await this.db
			.insert(clarityDailyMetrics)
			.values({
				clarityProjectId: snapshot.clarityProjectId,
				projectId: snapshot.projectId,
				observedDate: snapshot.observedDate,
				sessionsCount: snapshot.metrics.sessionsCount,
				botSessionsCount: snapshot.metrics.botSessionsCount,
				distinctUserCount: snapshot.metrics.distinctUserCount,
				pagesPerSession: snapshot.metrics.pagesPerSession,
				rageClicks: snapshot.metrics.rageClicks,
				deadClicks: snapshot.metrics.deadClicks,
				avgEngagementSeconds: snapshot.metrics.avgEngagementSeconds,
				avgScrollDepth: snapshot.metrics.avgScrollDepth,
				rawPayloadId: snapshot.rawPayloadId,
			})
			.onConflictDoNothing({
				target: [clarityDailyMetrics.clarityProjectId, clarityDailyMetrics.observedDate],
			})
			.returning({ clarityProjectId: clarityDailyMetrics.clarityProjectId });
		return { inserted: result.length > 0 };
	}

	async listForClarityProject(
		clarityProjectId: ExperienceAnalytics.ClarityProjectId,
		query: ExperienceAnalytics.ExperienceSnapshotQuery,
	): Promise<readonly ExperienceAnalytics.ExperienceSnapshot[]> {
		const rows = await this.db
			.select()
			.from(clarityDailyMetrics)
			.where(
				and(
					eq(clarityDailyMetrics.clarityProjectId, clarityProjectId),
					between(clarityDailyMetrics.observedDate, query.from, query.to),
				),
			)
			.orderBy(clarityDailyMetrics.observedDate);
		return rows.map((r) =>
			ExperienceAnalytics.ExperienceSnapshot.rehydrate({
				clarityProjectId: r.clarityProjectId as ExperienceAnalytics.ClarityProjectId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedDate: r.observedDate,
				metrics: ExperienceAnalytics.ExperienceMetrics.create({
					sessionsCount: r.sessionsCount,
					botSessionsCount: r.botSessionsCount,
					distinctUserCount: r.distinctUserCount,
					pagesPerSession: r.pagesPerSession,
					rageClicks: r.rageClicks,
					deadClicks: r.deadClicks,
					avgEngagementSeconds: r.avgEngagementSeconds,
					avgScrollDepth: r.avgScrollDepth,
				}),
				rawPayloadId: r.rawPayloadId,
			}),
		);
	}
}
