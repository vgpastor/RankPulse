import type { ProjectRankingItem } from '@rankpulse/sdk';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	type DataTableColumn,
	EmptyState,
	KpiCard,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { KeywordHistoryDrawer } from '../components/keyword-history-drawer.js';
import { api } from '../lib/api.js';

type OpportunityCategory = 'quick-win' | 'strategic-bet' | 'easy-door' | 'frontier';

interface Opportunity extends ProjectRankingItem {
	score: number;
	category: OpportunityCategory;
	estimatedCtrGainPct: number;
}

// CTR by SERP position (Advanced Web Ranking 2024 study, simplified).
const CTR_BY_POSITION: Record<number, number> = {
	1: 28,
	2: 15,
	3: 11,
	4: 8,
	5: 6,
	6: 4.5,
	7: 3.5,
	8: 2.8,
	9: 2.4,
	10: 2,
	11: 1.6,
	12: 1.4,
	13: 1.2,
	14: 1.05,
	15: 0.9,
	16: 0.8,
	17: 0.7,
	18: 0.62,
	19: 0.55,
	20: 0.5,
	21: 0.45,
	22: 0.4,
	23: 0.36,
	24: 0.32,
	25: 0.3,
	26: 0.27,
	27: 0.25,
	28: 0.22,
	29: 0.2,
	30: 0.18,
};

const ctrFor = (position: number): number => {
	if (position < 1) return 0;
	if (position > 30) return 0.1;
	return CTR_BY_POSITION[Math.round(position)] ?? 0;
};

const categorize = (position: number): OpportunityCategory => {
	if (position >= 11 && position <= 15) return 'quick-win';
	if (position >= 16 && position <= 20) return 'easy-door';
	if (position >= 21 && position <= 30) return 'strategic-bet';
	return 'frontier';
};

const buildOpportunities = (rankings: readonly ProjectRankingItem[]): Opportunity[] => {
	const latestPerKw = new Map<string, ProjectRankingItem>();
	for (const r of rankings) {
		const cur = latestPerKw.get(r.trackedKeywordId);
		if (!cur || r.observedAt > cur.observedAt) latestPerKw.set(r.trackedKeywordId, r);
	}
	const opportunities: Opportunity[] = [];
	for (const r of latestPerKw.values()) {
		if (r.position === null || r.position < 11 || r.position > 30) continue;
		const ctrCurrent = ctrFor(r.position);
		const ctrTop10 = ctrFor(10);
		const estimatedCtrGainPct = Math.max(ctrTop10 - ctrCurrent, 0);
		const score = (31 - r.position) * estimatedCtrGainPct;
		opportunities.push({
			...r,
			score,
			category: categorize(r.position),
			estimatedCtrGainPct,
		});
	}
	return opportunities.sort((a, b) => b.score - a.score);
};

const categoryBadgeVariant = (cat: OpportunityCategory): 'success' | 'warning' | 'default' | 'secondary' => {
	if (cat === 'quick-win') return 'success';
	if (cat === 'easy-door') return 'default';
	if (cat === 'strategic-bet') return 'warning';
	return 'secondary';
};

export const OpportunitiesPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/opportunities' });
	const { t } = useTranslation('opportunities');
	const [filter, setFilter] = useState<'all' | OpportunityCategory>('all');
	const [historyOf, setHistoryOf] = useState<{ trackedKeywordId: string; phrase: string } | null>(null);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});

	const opportunities = useMemo(() => buildOpportunities(rankingsQuery.data ?? []), [rankingsQuery.data]);
	const filtered = useMemo(
		() => (filter === 'all' ? opportunities : opportunities.filter((o) => o.category === filter)),
		[opportunities, filter],
	);

	const summary = useMemo(() => {
		const quickWins = opportunities.filter((o) => o.category === 'quick-win').length;
		const easyDoors = opportunities.filter((o) => o.category === 'easy-door').length;
		const strategic = opportunities.filter((o) => o.category === 'strategic-bet').length;
		return { total: opportunities.length, quickWins, easyDoors, strategic };
	}, [opportunities]);

	const columns: DataTableColumn<Opportunity>[] = [
		{
			key: 'phrase',
			header: t('table.phrase'),
			cell: (row) => (
				<button
					type="button"
					className="text-left hover:underline"
					onClick={() => setHistoryOf({ trackedKeywordId: row.trackedKeywordId, phrase: row.phrase })}
				>
					<span className="font-medium">{row.phrase}</span>
					<span className="block text-xs text-muted-foreground">{row.domain}</span>
				</button>
			),
		},
		{
			key: 'position',
			header: t('table.position'),
			cell: (row) => <span className="font-mono font-semibold">#{row.position}</span>,
		},
		{
			key: 'category',
			header: t('table.category'),
			cell: (row) => (
				<Badge variant={categoryBadgeVariant(row.category)}>{t(`category.${row.category}`)}</Badge>
			),
		},
		{
			key: 'ctrGain',
			header: t('table.ctrGain'),
			cell: (row) => <span className="tabular-nums">+{row.estimatedCtrGainPct.toFixed(1)} pts</span>,
			hideOnMobile: true,
		},
		{
			key: 'score',
			header: t('table.score'),
			cell: (row) => <span className="font-mono tabular-nums">{row.score.toFixed(1)}</span>,
		},
		{
			key: 'context',
			header: t('table.context'),
			cell: (row) => (
				<span className="text-xs text-muted-foreground">
					{row.country} · {row.language} · {row.device}
				</span>
			),
			hideOnMobile: true,
		},
	];

	if (projectQuery.isLoading || rankingsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<Link
							to="/projects/$id"
							params={{ id: projectId }}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<ArrowLeft size={12} />
							{t('back')}
						</Link>
						<h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Sparkles size={20} className="text-primary" />
							{t('title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t('subtitle')}
						</p>
					</div>
				</header>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<KpiCard label={t('kpi.total')} value={summary.total.toString()} hint={t('kpi.totalHint')} />
					<KpiCard
						label={t('kpi.quickWins')}
						icon={<TrendingUp size={14} />}
						value={summary.quickWins.toString()}
						hint={t('kpi.quickWinsHint')}
					/>
					<KpiCard
						label={t('kpi.easyDoors')}
						value={summary.easyDoors.toString()}
						hint={t('kpi.easyDoorsHint')}
					/>
					<KpiCard
						label={t('kpi.strategic')}
						icon={<Target size={14} />}
						value={summary.strategic.toString()}
						hint={t('kpi.strategicHint')}
					/>
				</div>

				<div className="flex flex-wrap gap-1" role="tablist" aria-label={t('filterLabel')}>
					{(['all', 'quick-win', 'easy-door', 'strategic-bet'] as const).map((opt) => (
						<Button
							key={opt}
							type="button"
							size="sm"
							variant={filter === opt ? 'primary' : 'secondary'}
							onClick={() => setFilter(opt)}
							aria-pressed={filter === opt}
						>
							{t(`filter.${opt}`)}
						</Button>
					))}
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('table.title', { count: filtered.length })}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('table.hint')}</p>
					</CardHeader>
					<CardContent>
						{filtered.length === 0 ? (
							<EmptyState title={t('empty.title')} description={t('empty.description')} />
						) : (
							<DataTable
								columns={columns}
								rows={filtered}
								rowKey={(row) => row.trackedKeywordId}
								empty={t('empty.title')}
							/>
						)}
					</CardContent>
				</Card>
			</div>
			<KeywordHistoryDrawer
				open={Boolean(historyOf)}
				onClose={() => setHistoryOf(null)}
				trackedKeywordId={historyOf?.trackedKeywordId ?? null}
				phrase={historyOf?.phrase ?? null}
			/>
		</AppShell>
	);
};
