import { MetaAdsAttribution, type ProjectManagement } from '@rankpulse/domain';
import { and, between, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { metaPixelEventsDaily } from '../../schema/index.js';

export class DrizzleMetaPixelEventDailyRepository
	implements MetaAdsAttribution.MetaPixelEventDailyRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(rows: readonly MetaAdsAttribution.MetaPixelEventDaily[]): Promise<{ inserted: number }> {
		if (rows.length === 0) return { inserted: 0 };
		const values = rows.map((r) => ({
			metaPixelId: r.metaPixelId,
			projectId: r.projectId,
			observedDate: r.observedDate,
			eventName: r.eventName,
			eventCount: r.stats.count,
			valueSum: r.stats.valueSum,
			rawPayloadId: r.rawPayloadId,
		}));
		const inserted = await this.db
			.insert(metaPixelEventsDaily)
			.values(values)
			.onConflictDoNothing({
				target: [
					metaPixelEventsDaily.metaPixelId,
					metaPixelEventsDaily.observedDate,
					metaPixelEventsDaily.eventName,
				],
			})
			.returning({ metaPixelId: metaPixelEventsDaily.metaPixelId });
		return { inserted: inserted.length };
	}

	async listForPixel(
		pixelId: MetaAdsAttribution.MetaPixelId,
		query: MetaAdsAttribution.MetaPixelEventDailyQuery,
	): Promise<readonly MetaAdsAttribution.MetaPixelEventDaily[]> {
		const rows = await this.db
			.select()
			.from(metaPixelEventsDaily)
			.where(
				and(
					eq(metaPixelEventsDaily.metaPixelId, pixelId),
					between(metaPixelEventsDaily.observedDate, query.from, query.to),
				),
			)
			.orderBy(metaPixelEventsDaily.observedDate, metaPixelEventsDaily.eventName);
		return rows.map((r) =>
			MetaAdsAttribution.MetaPixelEventDaily.rehydrate({
				metaPixelId: r.metaPixelId as MetaAdsAttribution.MetaPixelId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedDate: r.observedDate,
				eventName: r.eventName,
				stats: MetaAdsAttribution.MetaPixelEventStats.create({
					count: r.eventCount,
					valueSum: r.valueSum,
				}),
				rawPayloadId: r.rawPayloadId,
			}),
		);
	}
}
