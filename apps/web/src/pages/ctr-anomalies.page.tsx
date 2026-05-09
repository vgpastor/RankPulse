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
import { ArrowLeft, ExternalLink, MousePointerClick } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

interface AnomalyRow {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	avgPosition: number;
}

export const CtrAnomaliesPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/ctr-anomalies' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const anomaliesQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'ctr-anomalies', 'page'],
		queryFn: () => api.cockpit.ctrAnomalies(projectId),
	});

	const rows = anomaliesQuery.data?.anomalies ?? [];
	const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);

	const columns: DataTableColumn<AnomalyRow>[] = [
		{
			key: 'query',
			header: t('cockpit:ctrAnomaliesPage.query'),
			cell: (row) => <span className="break-words font-medium">{row.query}</span>,
		},
		{
			key: 'page',
			header: t('cockpit:ctrAnomaliesPage.page'),
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
			header: t('cockpit:ctrAnomaliesPage.impressions'),
			cell: (row) => <span className="font-mono">{row.impressions.toLocaleString()}</span>,
		},
		{
			key: 'avgPosition',
			header: t('cockpit:ctrAnomaliesPage.avgPosition'),
			cell: (row) => <span className="font-mono">#{row.avgPosition.toFixed(1)}</span>,
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
						<MousePointerClick size={20} className="text-rose-600" />
						{t('cockpit:ctrAnomaliesPage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:ctrAnomaliesPage.subtitle')}
					</p>
				</header>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
					<KpiCard
						label={t('cockpit:ctrAnomaliesPage.kpi.count')}
						value={rows.length.toString()}
						hint={t('cockpit:ctrAnomaliesPage.kpi.countHint')}
					/>
					<KpiCard
						label={t('cockpit:ctrAnomaliesPage.kpi.impressionsLost')}
						value={totalImpressions.toLocaleString()}
						hint={t('cockpit:ctrAnomaliesPage.kpi.impressionsLostHint')}
					/>
				</div>

				{rows.length === 0 ? (
					<EmptyState
						icon={<MousePointerClick size={32} />}
						title={t('cockpit:widgets.ctrAnomaly.empty')}
						description={t('cockpit:widgets.ctrAnomaly.emptyDescription')}
					/>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t('cockpit:ctrAnomaliesPage.tableTitle')}</CardTitle>
							<p className="text-xs text-muted-foreground">{t('cockpit:ctrAnomaliesPage.tableHint')}</p>
						</CardHeader>
						<CardContent>
							<DataTable
								columns={columns}
								rows={rows}
								rowKey={(row) => `${row.query}-${row.page ?? ''}`}
								empty={t('cockpit:ctrAnomaliesPage.empty')}
							/>
						</CardContent>
					</Card>
				)}
			</div>
		</AppShell>
	);
};
