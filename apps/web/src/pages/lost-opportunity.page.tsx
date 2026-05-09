import {
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
import { ArrowLeft, ExternalLink, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

interface LostOpportunityRow {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	currentPosition: number;
	currentCtr: number;
	targetCtr: number;
	lostClicks: number;
}

export const LostOpportunityPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/lost-opportunity' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const dataQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'lost-opportunity', 'page'],
		queryFn: () => api.cockpit.lostOpportunity(projectId, { limit: 100 }),
	});

	const rows = dataQuery.data?.rows ?? [];
	const total = dataQuery.data?.totalLostClicks ?? 0;

	const columns: DataTableColumn<LostOpportunityRow>[] = [
		{
			key: 'query',
			header: t('cockpit:lostOpportunityPage.query'),
			cell: (row) => <span className="break-words font-medium">{row.query}</span>,
		},
		{
			key: 'page',
			header: t('cockpit:lostOpportunityPage.page'),
			cell: (row) =>
				row.page ? (
					<a
						href={row.page}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ExternalLink size={11} />
						<span className="truncate">{row.page}</span>
					</a>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				),
			hideOnMobile: true,
		},
		{
			key: 'impressions',
			header: t('cockpit:lostOpportunityPage.impressions'),
			cell: (row) => <span className="font-mono">{row.impressions.toLocaleString()}</span>,
		},
		{
			key: 'currentPosition',
			header: t('cockpit:lostOpportunityPage.currentPosition'),
			cell: (row) => <span className="font-mono">#{row.currentPosition.toFixed(1)}</span>,
		},
		{
			key: 'ctrJump',
			header: t('cockpit:lostOpportunityPage.ctrJump'),
			cell: (row) => (
				<span className="font-mono text-xs">
					{(row.currentCtr * 100).toFixed(2)}% → {(row.targetCtr * 100).toFixed(2)}%
				</span>
			),
			hideOnMobile: true,
		},
		{
			key: 'lostClicks',
			header: t('cockpit:lostOpportunityPage.lostClicks'),
			cell: (row) => (
				<span className="font-mono font-semibold text-rose-600">+{row.lostClicks.toLocaleString()}</span>
			),
		},
	];

	if (projectQuery.isLoading) {
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
						<TrendingDown size={20} className="text-rose-600" />
						{t('cockpit:lostOpportunityPage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:lostOpportunityPage.subtitle')}
					</p>
				</header>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
					<KpiCard
						label={t('cockpit:lostOpportunityPage.kpi.totalLost')}
						value={total.toLocaleString()}
						hint={t('cockpit:lostOpportunityPage.kpi.totalLostHint')}
					/>
					<KpiCard
						label={t('cockpit:lostOpportunityPage.kpi.queries')}
						value={rows.length.toString()}
						hint={t('cockpit:lostOpportunityPage.kpi.queriesHint')}
					/>
				</div>

				{rows.length === 0 ? (
					<EmptyState
						icon={<TrendingDown size={32} />}
						title={t('cockpit:widgets.lostOpportunity.empty')}
						description={t('cockpit:widgets.lostOpportunity.emptyDescription')}
					/>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t('cockpit:lostOpportunityPage.tableTitle')}</CardTitle>
							<p className="text-xs text-muted-foreground">{t('cockpit:lostOpportunityPage.tableHint')}</p>
						</CardHeader>
						<CardContent>
							<DataTable
								columns={columns}
								rows={rows}
								rowKey={(row) => `${row.query}-${row.page ?? ''}`}
								empty={t('cockpit:lostOpportunityPage.empty')}
							/>
						</CardContent>
					</Card>
				)}
			</div>
		</AppShell>
	);
};
