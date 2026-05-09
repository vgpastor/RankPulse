import type { WebPerformanceContracts } from '@rankpulse/contracts';
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
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Gauge, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type Snapshot = WebPerformanceContracts.PageSpeedSnapshotDto;
type TrackedPage = WebPerformanceContracts.TrackedPageDto;

interface PageWithLatest {
	page: TrackedPage;
	latest: Snapshot | null;
}

const ROW_BAD = 0.5;
const ROW_OK = 0.9;

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const scoreColor = (score: number | null): string => {
	if (score === null) return 'text-muted-foreground';
	if (score >= ROW_OK) return 'text-emerald-600';
	if (score >= ROW_BAD) return 'text-amber-600';
	return 'text-red-600';
};

const scoreBadgeVariant = (score: number | null): 'success' | 'warning' | 'destructive' | 'secondary' => {
	if (score === null) return 'secondary';
	if (score >= ROW_OK) return 'success';
	if (score >= ROW_BAD) return 'warning';
	return 'destructive';
};

const formatScore = (score: number | null): string =>
	score === null ? '—' : Math.round(score * 100).toString();

const formatMs = (ms: number | null): string => {
	if (ms === null) return '—';
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
};

const formatCls = (cls: number | null): string => (cls === null ? '—' : cls.toFixed(3));

export const PageExperiencePage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/page-experience' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const pagesQuery = useQuery({
		queryKey: ['project', projectId, 'page-speed', 'pages'],
		queryFn: () => api.pageSpeed.listForProject(projectId),
	});

	const pages = pagesQuery.data ?? [];
	const now = new Date();
	const from = new Date(now.getTime() - HISTORY_WINDOW_MS).toISOString();
	const to = now.toISOString();

	const historyQueries = useQueries({
		queries: pages.map((page) => ({
			queryKey: ['page-speed', 'history', page.id, 'page-experience-30d'],
			queryFn: () => api.pageSpeed.history(page.id, { from, to }),
			enabled: pages.length > 0,
			staleTime: 5 * 60 * 1000,
		})),
	});

	const rows: PageWithLatest[] = pages.map((page, idx) => {
		const result = historyQueries[idx];
		const snapshots = result?.data ?? [];
		// History is returned chronologically; pick the most recent.
		const latest = snapshots.length === 0 ? null : (snapshots[snapshots.length - 1] ?? null);
		return { page, latest };
	});

	rows.sort((a, b) => (a.latest?.performanceScore ?? 0) - (b.latest?.performanceScore ?? 0));

	const withScores = rows.filter((r) => r.latest?.performanceScore !== null && r.latest !== null);
	const avgScore =
		withScores.length === 0
			? null
			: withScores.reduce((acc, r) => acc + (r.latest?.performanceScore ?? 0), 0) / withScores.length;
	const pagesWithIssues = rows.filter(
		(r) => r.latest?.performanceScore !== null && (r.latest?.performanceScore ?? 1) < ROW_BAD,
	).length;

	const columns: DataTableColumn<PageWithLatest>[] = [
		{
			key: 'page',
			header: t('cockpit:pageExperiencePage.page'),
			cell: ({ page }) => (
				<div className="min-w-0">
					<a
						href={page.url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 break-words text-sm font-medium hover:text-primary"
					>
						{page.url}
						<ExternalLink size={11} />
					</a>
					<p className="flex items-center gap-1 text-xs text-muted-foreground">
						<Smartphone size={10} />
						{page.strategy}
					</p>
				</div>
			),
		},
		{
			key: 'performanceScore',
			header: t('cockpit:pageExperiencePage.performance'),
			cell: ({ latest }) => (
				<span className={`font-mono text-sm ${scoreColor(latest?.performanceScore ?? null)}`}>
					{formatScore(latest?.performanceScore ?? null)}
				</span>
			),
		},
		{
			key: 'lcp',
			header: 'LCP',
			cell: ({ latest }) => <span className="font-mono text-sm">{formatMs(latest?.lcpMs ?? null)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'inp',
			header: 'INP',
			cell: ({ latest }) => <span className="font-mono text-sm">{formatMs(latest?.inpMs ?? null)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'cls',
			header: 'CLS',
			cell: ({ latest }) => <span className="font-mono text-sm">{formatCls(latest?.cls ?? null)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'seo',
			header: t('cockpit:pageExperiencePage.seo'),
			cell: ({ latest }) => (
				<span className={`font-mono text-sm ${scoreColor(latest?.seoScore ?? null)}`}>
					{formatScore(latest?.seoScore ?? null)}
				</span>
			),
			hideOnMobile: true,
		},
		{
			key: 'a11y',
			header: t('cockpit:pageExperiencePage.accessibility'),
			cell: ({ latest }) => (
				<span className={`font-mono text-sm ${scoreColor(latest?.accessibilityScore ?? null)}`}>
					{formatScore(latest?.accessibilityScore ?? null)}
				</span>
			),
			hideOnMobile: true,
		},
		{
			key: 'status',
			header: t('cockpit:pageExperiencePage.status'),
			cell: ({ latest }) => (
				<Badge variant={scoreBadgeVariant(latest?.performanceScore ?? null)}>
					{latest === null
						? t('cockpit:pageExperiencePage.statusNoData')
						: latest.performanceScore === null
							? t('cockpit:pageExperiencePage.statusUnknown')
							: latest.performanceScore >= ROW_OK
								? t('cockpit:pageExperiencePage.statusGood')
								: latest.performanceScore >= ROW_BAD
									? t('cockpit:pageExperiencePage.statusOk')
									: t('cockpit:pageExperiencePage.statusPoor')}
				</Badge>
			),
		},
	];

	if (projectQuery.isLoading || pagesQuery.isLoading) {
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
						<Gauge size={20} className="text-emerald-600" />
						{t('cockpit:pageExperiencePage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:pageExperiencePage.subtitle')}
					</p>
				</header>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
					<KpiCard
						label={t('cockpit:pageExperiencePage.kpi.tracked')}
						value={pages.length.toString()}
						hint={t('cockpit:pageExperiencePage.kpi.trackedHint')}
					/>
					<KpiCard
						label={t('cockpit:pageExperiencePage.kpi.avgScore')}
						value={avgScore === null ? '—' : Math.round(avgScore * 100).toString()}
						hint={t('cockpit:pageExperiencePage.kpi.avgScoreHint')}
					/>
					<KpiCard
						label={t('cockpit:pageExperiencePage.kpi.issues')}
						value={pagesWithIssues.toString()}
						hint={t('cockpit:pageExperiencePage.kpi.issuesHint')}
					/>
				</div>

				{rows.length === 0 ? (
					<EmptyState
						icon={<Gauge size={32} />}
						title={t('cockpit:pageExperiencePage.empty')}
						description={t('cockpit:pageExperiencePage.emptyDescription')}
					/>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t('cockpit:pageExperiencePage.tableTitle')}</CardTitle>
							<p className="text-xs text-muted-foreground">{t('cockpit:pageExperiencePage.tableHint')}</p>
						</CardHeader>
						<CardContent>
							<DataTable
								columns={columns}
								rows={rows}
								rowKey={(row) => row.page.id}
								empty={t('cockpit:pageExperiencePage.empty')}
							/>
						</CardContent>
					</Card>
				)}
			</div>
		</AppShell>
	);
};
