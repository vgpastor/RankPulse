import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	type DataTableColumn,
	EmptyState,
	KpiCard,
	Sparkline,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

interface MonthlyRow {
	month: string;
	totalVolume: number;
	distinctKeywords: number;
}

const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
};

const formatMonth = (iso: string, locale: string): string => {
	const d = new Date(iso);
	return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', timeZone: 'UTC' });
};

export const SearchDemandTrendPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/search-demand-trend' });
	const { t, i18n } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const trendQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'search-demand-trend'],
		queryFn: () => api.cockpit.searchDemandTrend(projectId, { months: 13 }),
	});

	const data = trendQuery.data;
	const points = data?.points ?? [];
	const sparkValues = points.map((p) => p.totalVolume);
	const deltaPct = data?.deltaPct ?? null;

	const columns: DataTableColumn<MonthlyRow>[] = [
		{
			key: 'month',
			header: t('cockpit:searchDemandTrendPage.month'),
			cell: (row) => <span className="font-medium">{formatMonth(row.month, i18n.language)}</span>,
		},
		{
			key: 'totalVolume',
			header: t('cockpit:searchDemandTrendPage.totalVolume'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.totalVolume)}</span>,
		},
		{
			key: 'distinctKeywords',
			header: t('cockpit:searchDemandTrendPage.distinctKeywords'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.distinctKeywords)}</span>,
			hideOnMobile: true,
		},
	];

	if (projectQuery.isLoading || trendQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const project = projectQuery.data;

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header>
					<Link
						to="/projects/$id/cockpit"
						params={{ id: projectId }}
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft size={12} />
						{t('cockpit:backToCockpit')}
					</Link>
					<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
						{deltaPct !== null && deltaPct >= 0 ? (
							<TrendingUp size={20} className="text-emerald-600" />
						) : (
							<TrendingDown size={20} className="text-red-600" />
						)}
						{t('cockpit:searchDemandTrendPage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:searchDemandTrendPage.subtitle')}
					</p>
				</header>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<KpiCard
						label={t('cockpit:searchDemandTrendPage.kpi.latest')}
						value={data?.latestVolume === undefined ? '—' : formatNumber(data.latestVolume)}
						hint={t('cockpit:searchDemandTrendPage.kpi.latestHint')}
					/>
					<KpiCard
						label={t('cockpit:searchDemandTrendPage.kpi.previous')}
						value={data?.previousVolume === undefined ? '—' : formatNumber(data.previousVolume)}
						hint={t('cockpit:searchDemandTrendPage.kpi.previousHint')}
					/>
					<KpiCard
						label={t('cockpit:searchDemandTrendPage.kpi.deltaPct')}
						value={deltaPct === null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`}
						hint={t('cockpit:searchDemandTrendPage.kpi.deltaPctHint')}
					/>
				</div>

				{points.length === 0 ? (
					<EmptyState
						icon={<TrendingUp size={32} />}
						title={t('cockpit:searchDemandTrendPage.empty')}
						description={t('cockpit:searchDemandTrendPage.emptyDescription')}
					/>
				) : (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('cockpit:searchDemandTrendPage.chartTitle')}</CardTitle>
								<p className="text-xs text-muted-foreground">
									{t('cockpit:searchDemandTrendPage.chartHint')}
								</p>
							</CardHeader>
							<CardContent>
								<Sparkline
									values={sparkValues}
									height={120}
									stroke={deltaPct !== null && deltaPct >= 0 ? 'rgb(5, 150, 105)' : 'rgb(220, 38, 38)'}
									fill="rgba(99, 102, 241, 0.08)"
									strokeWidth={2}
									className="text-primary"
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('cockpit:searchDemandTrendPage.tableTitle')}</CardTitle>
							</CardHeader>
							<CardContent>
								<DataTable
									columns={columns}
									rows={points}
									rowKey={(row) => row.month}
									empty={t('cockpit:searchDemandTrendPage.empty')}
								/>
							</CardContent>
						</Card>
					</>
				)}
			</div>
		</AppShell>
	);
};
