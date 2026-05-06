import { MacroContext, type ProjectManagement } from '@rankpulse/domain';
import { and, between, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { radarRankSnapshots } from '../../schema/index.js';

export class DrizzleRadarRankSnapshotRepository implements MacroContext.RadarRankSnapshotRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(snapshot: MacroContext.RadarRankSnapshot): Promise<{ inserted: boolean }> {
		const result = await this.db
			.insert(radarRankSnapshots)
			.values({
				monitoredDomainId: snapshot.monitoredDomainId,
				projectId: snapshot.projectId,
				observedDate: snapshot.observedDate,
				rank: snapshot.rank.rank,
				bucket: snapshot.rank.bucket,
				categories: { ...snapshot.rank.categories },
				rawPayloadId: snapshot.rawPayloadId,
			})
			.onConflictDoNothing({
				target: [radarRankSnapshots.monitoredDomainId, radarRankSnapshots.observedDate],
			})
			.returning({ monitoredDomainId: radarRankSnapshots.monitoredDomainId });
		return { inserted: result.length > 0 };
	}

	async listForDomain(
		monitoredDomainId: MacroContext.MonitoredDomainId,
		query: MacroContext.RadarRankSnapshotQuery,
	): Promise<readonly MacroContext.RadarRankSnapshot[]> {
		const rows = await this.db
			.select()
			.from(radarRankSnapshots)
			.where(
				and(
					eq(radarRankSnapshots.monitoredDomainId, monitoredDomainId),
					between(radarRankSnapshots.observedDate, query.from, query.to),
				),
			)
			.orderBy(radarRankSnapshots.observedDate);
		return rows.map((r) =>
			MacroContext.RadarRankSnapshot.rehydrate({
				monitoredDomainId: r.monitoredDomainId as MacroContext.MonitoredDomainId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedDate: r.observedDate,
				rank: MacroContext.RadarRank.create({
					rank: r.rank,
					bucket: r.bucket,
					categories: r.categories ?? {},
				}),
				rawPayloadId: r.rawPayloadId,
			}),
		);
	}
}
