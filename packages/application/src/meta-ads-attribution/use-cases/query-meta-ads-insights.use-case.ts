import type { MetaAdsAttribution } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryMetaAdsInsightsCommand {
	metaAdAccountId: string;
	from: string;
	to: string;
}

export interface MetaAdsInsightDailyView {
	observedDate: string;
	level: MetaAdsAttribution.AdsInsightLevel;
	entityId: string;
	entityName: string;
	impressions: number;
	clicks: number;
	spend: number;
	conversions: number;
}

export class QueryMetaAdsInsightsUseCase {
	constructor(
		private readonly accounts: MetaAdsAttribution.MetaAdAccountRepository,
		private readonly insights: MetaAdsAttribution.MetaAdsInsightDailyRepository,
	) {}

	async execute(cmd: QueryMetaAdsInsightsCommand): Promise<readonly MetaAdsInsightDailyView[]> {
		const account = await this.accounts.findById(cmd.metaAdAccountId as MetaAdsAttribution.MetaAdAccountId);
		if (!account) throw new NotFoundError(`MetaAdAccount ${cmd.metaAdAccountId} not found`);
		const rows = await this.insights.listForAccount(account.id, { from: cmd.from, to: cmd.to });
		return rows.map((r) => ({
			observedDate: r.observedDate,
			level: r.metrics.level,
			entityId: r.metrics.entityId,
			entityName: r.metrics.entityName,
			impressions: r.metrics.impressions,
			clicks: r.metrics.clicks,
			spend: r.metrics.spend,
			conversions: r.metrics.conversions,
		}));
	}
}
