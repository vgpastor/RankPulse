import type { IdentityAccess, ProviderConnectivity } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';

export interface UsageRowView {
	key: string;
	providerId: string;
	calls: number;
	costCents: number;
}

export interface ProviderUsageView {
	from: string;
	to: string;
	groupBy: ProviderConnectivity.UsageGrouping;
	totalCostCents: number;
	/** Upstream calls that were actually billed. */
	billedCalls: number;
	/** Succeeded runs that replayed a payload instead of calling upstream. */
	cachedRuns: number;
	/**
	 * Share of succeeded runs served from cache, 0–1. Null when nothing ran in
	 * the window — no executions is not a 0% hit rate, it is no data.
	 */
	cacheHitRatio: number | null;
	rows: readonly UsageRowView[];
}

export interface ReportProviderUsageCommand {
	organizationId: string;
	from: Date;
	to: Date;
	groupBy?: ProviderConnectivity.UsageGrouping;
}

const ratioOf = (counts: ProviderConnectivity.RunExecutionCounts): number | null => {
	const total = counts.billed + counts.fromCache;
	return total === 0 ? null : counts.fromCache / total;
};

/**
 * What an organization actually spent on providers in a window, and how much of
 * its workload avoided spending at all.
 *
 * Cost here is measured, not estimated: each billed call writes an
 * `ApiUsageEntry` carrying the real figure the endpoint reported, so a
 * misconfigured schedule shows up as money rather than as a forecast nobody
 * checks. Runs served from cache produce no entry, which is what makes
 * `cacheHitRatio` a meaningful companion to the totals.
 */
export class ReportProviderUsageUseCase {
	constructor(
		private readonly usage: ProviderConnectivity.ApiUsageRepository,
		private readonly runs: ProviderConnectivity.JobRunRepository,
	) {}

	async execute(cmd: ReportProviderUsageCommand): Promise<ProviderUsageView> {
		if (cmd.from >= cmd.to) {
			throw new InvalidInputError('`from` must be earlier than `to`');
		}

		const groupBy = cmd.groupBy ?? 'provider';
		const organizationId = cmd.organizationId as IdentityAccess.OrganizationId;

		const [rows, counts] = await Promise.all([
			this.usage.breakdown(organizationId, cmd.from, cmd.to, groupBy),
			this.runs.countExecutions(organizationId, cmd.from, cmd.to),
		]);

		return {
			from: cmd.from.toISOString(),
			to: cmd.to.toISOString(),
			groupBy,
			// Summing the grouped rows keeps the header consistent with the
			// table below it; a separate SUM query could disagree if a row
			// were filtered out of one and not the other.
			totalCostCents: rows.reduce((sum, r) => sum + r.costCents, 0),
			billedCalls: rows.reduce((sum, r) => sum + r.calls, 0),
			cachedRuns: counts.fromCache,
			cacheHitRatio: ratioOf(counts),
			rows,
		};
	}
}
