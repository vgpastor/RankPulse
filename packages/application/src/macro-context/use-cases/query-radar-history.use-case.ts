import type { MacroContext } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryRadarHistoryCommand {
	monitoredDomainId: string;
	from: string;
	to: string;
}

export interface RadarHistoryView {
	observedDate: string;
	rank: number | null;
	bucket: string | null;
	categories: Record<string, number>;
}

export class QueryRadarHistoryUseCase {
	constructor(
		private readonly domains: MacroContext.MonitoredDomainRepository,
		private readonly snapshots: MacroContext.RadarRankSnapshotRepository,
	) {}

	async execute(cmd: QueryRadarHistoryCommand): Promise<readonly RadarHistoryView[]> {
		const md = await this.domains.findById(cmd.monitoredDomainId as MacroContext.MonitoredDomainId);
		if (!md) throw new NotFoundError(`MonitoredDomain ${cmd.monitoredDomainId} not found`);
		const rows = await this.snapshots.listForDomain(md.id, { from: cmd.from, to: cmd.to });
		return rows.map((r) => ({
			observedDate: r.observedDate,
			rank: r.rank.rank,
			bucket: r.rank.bucket,
			categories: { ...r.rank.categories },
		}));
	}
}
