import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryBrandDecayCommand {
	projectId: string;
	/** Window covers the comparison; we always need ≥ 2 ISO weeks. Default 28d. */
	windowDays?: number;
	/** Threshold (percentage drop) at which the alert flag turns on. Default 20. */
	dropAlertPct?: number;
}

export interface BrandDecayBucket {
	clicksThisWeek: number;
	clicksLastWeek: number;
	deltaPct: number | null;
	topQueries: Array<{ query: string; clicks: number }>;
}

export interface QueryBrandDecayResponse {
	branded: BrandDecayBucket;
	nonBranded: BrandDecayBucket;
	weekStart: string | null;
	priorWeekStart: string | null;
	brandTokens: string[];
	alert: boolean;
	alertReason: 'no-brand-decay' | null;
}

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_DROP_ALERT_PCT = 20;

/**
 * Splits GSC clicks into branded vs non-branded for the latest two ISO
 * weeks and surfaces a decay alert when non-branded clicks dropped by
 * ≥ `dropAlertPct` week-over-week. Branded traffic is mostly inelastic
 * to SEO work, so a no-brand drop is the early-warning signal that the
 * organic engine is leaking.
 *
 * "Branded" classification is heuristic: the project's primary domain
 * root (e.g. `controlrondas.com` → `controlrondas`), the project name
 * tokens, and any non-primary `project_domains` entry roots. Anything
 * containing those tokens (case-insensitive substring) is branded. The
 * heuristic intentionally errs on the side of marking borderline
 * queries branded — a false positive (counting an SEO query as branded)
 * shrinks the no-brand bucket, hiding actionable drops; a false
 * negative bloats no-brand and surfaces noise. The alert threshold
 * (default 20%) compensates for the noise.
 */
export class QueryBrandDecayUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly cockpit: SearchConsoleInsights.GscCockpitReadModel,
	) {}

	async execute(cmd: QueryBrandDecayCommand): Promise<QueryBrandDecayResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const windowDays = Math.max(14, cmd.windowDays ?? DEFAULT_WINDOW_DAYS);
		const dropAlertPct = Math.max(1, cmd.dropAlertPct ?? DEFAULT_DROP_ALERT_PCT);

		const brandTokens = this.brandTokensFor(project);
		const rows = await this.cockpit.weeklyClicksByQuery(projectId, windowDays);

		// Group by week → branded/non-branded bucket.
		const byWeek = new Map<
			string,
			{ branded: Map<string, number>; nonBranded: Map<string, number>; weekStart: Date }
		>();
		for (const row of rows) {
			const key = row.weekStart.toISOString();
			let bucket = byWeek.get(key);
			if (!bucket) {
				bucket = { branded: new Map(), nonBranded: new Map(), weekStart: row.weekStart };
				byWeek.set(key, bucket);
			}
			const isBranded = isQueryBranded(row.query, brandTokens);
			const target = isBranded ? bucket.branded : bucket.nonBranded;
			target.set(row.query, (target.get(row.query) ?? 0) + row.clicks);
		}

		const sortedWeeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
		if (sortedWeeks.length === 0) {
			return {
				branded: emptyBucket(),
				nonBranded: emptyBucket(),
				weekStart: null,
				priorWeekStart: null,
				brandTokens: [...brandTokens],
				alert: false,
				alertReason: null,
			};
		}
		const last = sortedWeeks[sortedWeeks.length - 1];
		const prior = sortedWeeks.length >= 2 ? sortedWeeks[sortedWeeks.length - 2] : null;
		// `last` and `prior` come from a non-empty array we just sorted above
		// — sortedWeeks[len-1] always exists. The TS narrowing for
		// noUncheckedIndexedAccess still flags it, hence the assertion.
		const lastEntry = last as NonNullable<typeof last>;
		const priorEntry = prior as typeof prior;

		const branded = bucketFrom(lastEntry[1].branded, priorEntry?.[1].branded ?? null);
		const nonBranded = bucketFrom(lastEntry[1].nonBranded, priorEntry?.[1].nonBranded ?? null);
		const alert = nonBranded.deltaPct !== null && nonBranded.deltaPct <= -dropAlertPct;

		return {
			branded,
			nonBranded,
			weekStart: lastEntry[1].weekStart.toISOString(),
			priorWeekStart: priorEntry ? priorEntry[1].weekStart.toISOString() : null,
			brandTokens: [...brandTokens],
			alert,
			alertReason: alert ? 'no-brand-decay' : null,
		};
	}

	private brandTokensFor(project: ProjectManagement.Project): Set<string> {
		const tokens = new Set<string>();
		// Project name → individual word tokens, lowercased.
		for (const word of project.name.split(/[\s\-_./]+/)) {
			const lower = word.toLowerCase();
			if (lower.length >= 3) tokens.add(lower);
		}
		// All registered domains → root token (TLD-stripped).
		for (const entry of project.domains) {
			const root = stripTld(entry.domain.value).toLowerCase();
			if (root.length >= 3) tokens.add(root);
		}
		const primaryRoot = stripTld(project.primaryDomain.value).toLowerCase();
		if (primaryRoot.length >= 3) tokens.add(primaryRoot);
		return tokens;
	}
}

const stripTld = (raw: string): string => {
	const noWww = raw.toLowerCase().replace(/^www\./, '');
	const firstDot = noWww.indexOf('.');
	return firstDot === -1 ? noWww : noWww.slice(0, firstDot);
};

const isQueryBranded = (query: string, tokens: ReadonlySet<string>): boolean => {
	const lower = query.toLowerCase();
	for (const t of tokens) {
		if (lower.includes(t)) return true;
	}
	return false;
};

const bucketFrom = (current: Map<string, number>, prior: Map<string, number> | null): BrandDecayBucket => {
	const clicksThisWeek = sumValues(current);
	const clicksLastWeek = prior ? sumValues(prior) : 0;
	const deltaPct =
		!prior || clicksLastWeek === 0 ? null : ((clicksThisWeek - clicksLastWeek) / clicksLastWeek) * 100;
	const topQueries = [...current.entries()]
		.sort(([, a], [, b]) => b - a)
		.slice(0, 5)
		.map(([query, clicks]) => ({ query, clicks }));
	return {
		clicksThisWeek,
		clicksLastWeek,
		deltaPct: deltaPct === null ? null : Number(deltaPct.toFixed(2)),
		topQueries,
	};
};

const sumValues = (m: Map<string, number>): number => {
	let total = 0;
	for (const v of m.values()) total += v;
	return total;
};

const emptyBucket = (): BrandDecayBucket => ({
	clicksThisWeek: 0,
	clicksLastWeek: 0,
	deltaPct: null,
	topQueries: [],
});
