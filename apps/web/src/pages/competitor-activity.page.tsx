import type { ProjectManagementContracts } from '@rankpulse/contracts';
import {
	Badge,
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
import { Activity, ArrowLeft, ArrowUp, ExternalLink, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type ActivityRow = ProjectManagementContracts.CompetitorActivityRowDto;

const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
};

const formatDelta = (delta: number | null): string => {
	if (delta === null) return '—';
	if (delta === 0) return '±0';
	const sign = delta > 0 ? '+' : '';
	return `${sign}${formatNumber(delta)}`;
};

export const CompetitorActivityPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/competitor-activity' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const dataQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'competitor-activity', 'page'],
		queryFn: () => api.cockpit.competitorActivity(projectId),
	});

	const rows = dataQuery.data?.rows ?? [];
	const activeCount = rows.filter((r) => r.activityScore > 0).length;
	const maxScore = dataQuery.data?.maxScore ?? 0;

	const columns: DataTableColumn<ActivityRow>[] = [
		{
			key: 'competitor',
			header: t('cockpit:competitorActivityPage.competitor'),
			cell: (row) => (
				<div className="min-w-0">
					<p className="break-words font-medium">{row.label}</p>
					<a
						href={`https://${row.domain}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ExternalLink size={11} />
						<span className="truncate">{row.domain}</span>
					</a>
				</div>
			),
		},
		{
			key: 'wayback',
			header: t('cockpit:competitorActivityPage.wayback'),
			cell: (row) =>
				row.wayback ? (
					<div className="text-sm">
						<span className="font-mono">{formatNumber(row.wayback.snapshotCount)}</span>
						<span className="ml-2 text-xs text-muted-foreground">
							{formatDelta(row.wayback.deltaSnapshots)}
						</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">{t('cockpit:competitorActivityPage.noData')}</span>
				),
			hideOnMobile: true,
		},
		{
			key: 'backlinks',
			header: t('cockpit:competitorActivityPage.backlinks'),
			cell: (row) =>
				row.backlinks ? (
					<div className="text-sm">
						<span className="font-mono">{formatNumber(row.backlinks.totalBacklinks)}</span>
						<span className="ml-2 text-xs text-muted-foreground">
							{formatDelta(row.backlinks.deltaBacklinks)}
						</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">{t('cockpit:competitorActivityPage.noData')}</span>
				),
			hideOnMobile: true,
		},
		{
			key: 'referringDomains',
			header: t('cockpit:competitorActivityPage.referringDomains'),
			cell: (row) =>
				row.backlinks ? (
					<div className="text-sm">
						<span className="font-mono">{formatNumber(row.backlinks.referringDomains)}</span>
						<span className="ml-2 text-xs text-muted-foreground">
							{formatDelta(row.backlinks.deltaReferringDomains)}
						</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				),
			hideOnMobile: true,
		},
		{
			key: 'activityScore',
			header: t('cockpit:competitorActivityPage.activityScore'),
			cell: (row) => (
				<div className="flex items-center gap-2">
					<div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/40">
						<div className="h-full bg-amber-500" style={{ width: `${row.activityScore}%` }} />
					</div>
					<span className="font-mono text-xs">{row.activityScore}</span>
					{row.activityScore === 0 ? (
						<Badge variant="secondary">
							<Minus size={10} />
						</Badge>
					) : row.activityScore >= 60 ? (
						<Badge variant="warning">
							<ArrowUp size={10} />
						</Badge>
					) : null}
				</div>
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
						<Activity size={20} className="text-amber-600" />
						{t('cockpit:competitorActivityPage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:competitorActivityPage.subtitle')}
					</p>
				</header>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
					<KpiCard
						label={t('cockpit:competitorActivityPage.kpi.tracked')}
						value={rows.length.toString()}
						hint={t('cockpit:competitorActivityPage.kpi.trackedHint')}
					/>
					<KpiCard
						label={t('cockpit:competitorActivityPage.kpi.active')}
						value={activeCount.toString()}
						hint={t('cockpit:competitorActivityPage.kpi.activeHint')}
					/>
					<KpiCard
						label={t('cockpit:competitorActivityPage.kpi.maxScore')}
						value={maxScore.toString()}
						hint={t('cockpit:competitorActivityPage.kpi.maxScoreHint')}
					/>
				</div>

				{rows.length === 0 ? (
					<EmptyState
						icon={<Activity size={32} />}
						title={t('cockpit:competitorActivityPage.empty')}
						description={t('cockpit:competitorActivityPage.emptyDescription')}
					/>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t('cockpit:competitorActivityPage.tableTitle')}</CardTitle>
							<p className="text-xs text-muted-foreground">{t('cockpit:competitorActivityPage.tableHint')}</p>
						</CardHeader>
						<CardContent>
							<DataTable
								columns={columns}
								rows={rows}
								rowKey={(row) => row.competitorId}
								empty={t('cockpit:competitorActivityPage.empty')}
							/>
						</CardContent>
					</Card>
				)}
			</div>
		</AppShell>
	);
};
