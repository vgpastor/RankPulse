import type { ProjectManagementContracts } from '@rankpulse/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner } from '@rankpulse/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart as ReLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type ProjectDto = ProjectManagementContracts.ProjectDto;

type RangePreset = '7d' | '28d' | '90d';
const RANGE_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90 };

const PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);
const isoDayShift = (days: number): string => {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return isoDay(d);
};

interface ProjectMetrics {
	projectId: string;
	projectName: string;
	color: string;
	sessions: number;
	users: number;
	pageviews: number;
	gscClicks: number;
	gscImpressions: number;
	gscCtrPct: number;
	gscAvgPosition: number | null;
	avgSerpPosition: number | null;
	bingClicks: number;
	dailySessions: { day: string; value: number }[];
	dailyClicks: { day: string; value: number }[];
}

const formatCount = (value: number): string => Math.round(value).toLocaleString();

interface KpiRowDef {
	label: string;
	get: (m: ProjectMetrics) => number | null;
	format: (v: number | null) => string;
	lowerIsBetter?: boolean;
}

const buildHeatmap = (
	metrics: readonly ProjectMetrics[],
	rows: readonly KpiRowDef[],
): ('best' | 'worst' | 'neutral')[][] =>
	rows.map((row) => {
		const values = metrics.map((m) => row.get(m));
		const numeric = values.filter((v): v is number => v !== null);
		if (numeric.length === 0) return values.map(() => 'neutral' as const);
		const max = Math.max(...numeric);
		const min = Math.min(...numeric);
		return values.map((v) => {
			if (v === null) return 'neutral' as const;
			const isBest = row.lowerIsBetter ? v === min : v === max;
			const isWorst = row.lowerIsBetter ? v === max : v === min;
			if (isBest && max !== min) return 'best';
			if (isWorst && max !== min) return 'worst';
			return 'neutral';
		});
	});

const cellClass = (variant: 'best' | 'worst' | 'neutral'): string => {
	if (variant === 'best') return 'bg-emerald-500/15 text-emerald-700 font-semibold';
	if (variant === 'worst') return 'bg-red-500/15 text-red-700';
	return '';
};

export const PortfolioComparePage = () => {
	const { id: portfolioId } = useParams({ from: '/portfolios/$id/compare' });
	const { t } = useTranslation('portfolioCompare');
	const [range, setRange] = useState<RangePreset>('28d');

	const portfolioQuery = useQuery({
		queryKey: ['portfolio', portfolioId],
		queryFn: () => api.projects.getPortfolio(portfolioId),
	});
	const projectsQuery = useQuery({
		queryKey: ['organization', portfolioQuery.data?.organizationId, 'projects'],
		queryFn: () => api.projects.list(portfolioQuery.data?.organizationId ?? ''),
		enabled: Boolean(portfolioQuery.data?.organizationId),
	});

	const portfolioProjects: ProjectDto[] = useMemo(
		() => (projectsQuery.data ?? []).filter((p) => p.portfolioId === portfolioId),
		[projectsQuery.data, portfolioId],
	);

	const queries = useQueries({
		queries: portfolioProjects.map((project, idx) => {
			const fromDate = isoDayShift(RANGE_DAYS[range]);
			const toDate = isoDay(new Date());
			return {
				queryKey: ['portfolio-compare', portfolioId, range, project.id],
				queryFn: async (): Promise<ProjectMetrics> => {
					const [ga4Properties, gscProperties, bingProperties, rankings] = await Promise.all([
						api.ga4.listForProject(project.id),
						api.gsc.listForProject(project.id),
						api.bing.listForProject(project.id),
						api.rankTracking.listProjectRankings(project.id),
					]);
					const firstGa4 = ga4Properties[0]?.id;
					const firstGsc = gscProperties[0]?.id;
					const firstBing = bingProperties[0]?.id;
					const [ga4Rows, gscRows, bingRows] = await Promise.all([
						firstGa4 ? api.ga4.metrics(firstGa4, { from: fromDate, to: toDate }) : Promise.resolve([]),
						firstGsc ? api.gsc.performance(firstGsc) : Promise.resolve([]),
						firstBing ? api.bing.traffic(firstBing, { from: fromDate, to: toDate }) : Promise.resolve([]),
					]);
					const sessions = ga4Rows.reduce((acc, r) => acc + (r.metrics.sessions ?? 0), 0);
					const users = ga4Rows.reduce(
						(acc, r) => acc + (r.metrics.totalUsers ?? r.metrics.activeUsers ?? 0),
						0,
					);
					const pageviews = ga4Rows.reduce((acc, r) => acc + (r.metrics.screenPageViews ?? 0), 0);
					const dailySessionsMap = new Map<string, number>();
					for (const r of ga4Rows) {
						const day = r.observedDate.slice(0, 10);
						dailySessionsMap.set(day, (dailySessionsMap.get(day) ?? 0) + (r.metrics.sessions ?? 0));
					}
					const dailySessions = [...dailySessionsMap.entries()]
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([day, value]) => ({ day, value }));

					const gscFiltered = gscRows.filter((r) => r.observedAt >= fromDate);
					const gscClicks = gscFiltered.reduce((acc, r) => acc + r.clicks, 0);
					const gscImpressions = gscFiltered.reduce((acc, r) => acc + r.impressions, 0);
					const gscCtrPct = gscImpressions === 0 ? 0 : (gscClicks / gscImpressions) * 100;
					const positionWeighted = gscFiltered.reduce((acc, r) => acc + r.position * r.impressions, 0);
					const gscAvgPosition = gscImpressions === 0 ? null : positionWeighted / gscImpressions;
					const dailyClicksMap = new Map<string, number>();
					for (const r of gscFiltered) {
						const day = r.observedAt.slice(0, 10);
						dailyClicksMap.set(day, (dailyClicksMap.get(day) ?? 0) + r.clicks);
					}
					const dailyClicks = [...dailyClicksMap.entries()]
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([day, value]) => ({ day, value }));

					const bingClicks = bingRows.reduce((acc, r) => acc + r.clicks, 0);

					const ranked = rankings.filter((r) => r.position !== null);
					const avgSerpPosition =
						ranked.length === 0
							? null
							: ranked.reduce((acc, r) => acc + (r.position ?? 0), 0) / ranked.length;

					return {
						projectId: project.id,
						projectName: project.name,
						color: PALETTE[idx % PALETTE.length] ?? '#22c55e',
						sessions,
						users,
						pageviews,
						gscClicks,
						gscImpressions,
						gscCtrPct,
						gscAvgPosition,
						avgSerpPosition,
						bingClicks,
						dailySessions,
						dailyClicks,
					};
				},
			};
		}),
	});

	const metrics = queries.flatMap((q) => (q.data ? [q.data] : []));
	const isLoadingMetrics = queries.some((q) => q.isLoading);

	const sessionsChart = useMemo(() => {
		const allDates = new Set<string>();
		for (const m of metrics) for (const p of m.dailySessions) allDates.add(p.day);
		const sortedDates = [...allDates].sort();
		return sortedDates.map((day) => {
			const row: Record<string, string | number | null> = { day };
			for (const m of metrics) {
				const point = m.dailySessions.find((p) => p.day === day);
				row[m.projectName] = point?.value ?? null;
			}
			return row;
		});
	}, [metrics]);

	const clicksChart = useMemo(() => {
		const allDates = new Set<string>();
		for (const m of metrics) for (const p of m.dailyClicks) allDates.add(p.day);
		const sortedDates = [...allDates].sort();
		return sortedDates.map((day) => {
			const row: Record<string, string | number | null> = { day };
			for (const m of metrics) {
				const point = m.dailyClicks.find((p) => p.day === day);
				row[m.projectName] = point?.value ?? null;
			}
			return row;
		});
	}, [metrics]);

	const kpiRows: KpiRowDef[] = [
		{ label: t('rows.sessions'), get: (m) => m.sessions, format: (v) => (v === null ? '—' : formatCount(v)) },
		{ label: t('rows.users'), get: (m) => m.users, format: (v) => (v === null ? '—' : formatCount(v)) },
		{
			label: t('rows.pageviews'),
			get: (m) => m.pageviews,
			format: (v) => (v === null ? '—' : formatCount(v)),
		},
		{
			label: t('rows.gscClicks'),
			get: (m) => m.gscClicks,
			format: (v) => (v === null ? '—' : formatCount(v)),
		},
		{
			label: t('rows.gscImpressions'),
			get: (m) => m.gscImpressions,
			format: (v) => (v === null ? '—' : formatCount(v)),
		},
		{
			label: t('rows.gscCtr'),
			get: (m) => m.gscCtrPct,
			format: (v) => (v === null ? '—' : `${v.toFixed(2)}%`),
		},
		{
			label: t('rows.gscAvgPosition'),
			get: (m) => m.gscAvgPosition,
			format: (v) => (v === null ? '—' : v.toFixed(1)),
			lowerIsBetter: true,
		},
		{
			label: t('rows.avgSerpPosition'),
			get: (m) => m.avgSerpPosition,
			format: (v) => (v === null ? '—' : `#${v.toFixed(1)}`),
			lowerIsBetter: true,
		},
		{
			label: t('rows.bingClicks'),
			get: (m) => m.bingClicks,
			format: (v) => (v === null ? '—' : formatCount(v)),
		},
	];

	const heatmap = useMemo(() => buildHeatmap(metrics, kpiRows), [metrics, kpiRows]);

	if (portfolioQuery.isLoading || projectsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	if (!portfolioQuery.data) {
		return (
			<AppShell>
				<EmptyState title={t('notFound.title')} description={t('notFound.description')} />
			</AppShell>
		);
	}

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<Link
							to="/portfolios"
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<ArrowLeft size={12} />
							{t('back')}
						</Link>
						<h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
							{portfolioQuery.data.name} · {t('compare')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{portfolioProjects.length} {t('projectsCount')} · {t(`range.${range}`)}
						</p>
					</div>
					<div className="flex flex-wrap gap-1" role="tablist" aria-label={t('rangeLabel')}>
						{(['7d', '28d', '90d'] as RangePreset[]).map((preset) => (
							<Button
								key={preset}
								type="button"
								size="sm"
								variant={range === preset ? 'primary' : 'secondary'}
								onClick={() => setRange(preset)}
								aria-pressed={range === preset}
							>
								{t(`range.${preset}`)}
							</Button>
						))}
					</div>
				</header>

				{portfolioProjects.length === 0 ? (
					<EmptyState title={t('empty.title')} description={t('empty.description')} />
				) : isLoadingMetrics && metrics.length === 0 ? (
					<div className="flex justify-center py-10">
						<Spinner size="lg" />
					</div>
				) : (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('grid.title')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('grid.hint')}</p>
							</CardHeader>
							<CardContent className="overflow-x-auto">
								<table className="min-w-full text-sm">
									<thead>
										<tr className="border-b border-border">
											<th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
												{t('grid.metric')}
											</th>
											{metrics.map((m) => (
												<th
													key={m.projectId}
													className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
												>
													<span className="flex items-center gap-2">
														<span
															aria-hidden
															className="inline-block h-2 w-2 rounded-full"
															style={{ background: m.color }}
														/>
														<Link
															to="/projects/$id"
															params={{ id: m.projectId }}
															className="font-semibold hover:underline"
														>
															{m.projectName}
														</Link>
													</span>
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{kpiRows.map((row, rowIdx) => (
											<tr key={row.label} className="border-b border-border last:border-b-0">
												<td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">{row.label}</td>
												{metrics.map((m, idx) => (
													<td key={m.projectId} className="px-3 py-2">
														<span
															className={`inline-flex rounded px-2 py-0.5 font-mono tabular-nums ${cellClass(heatmap[rowIdx]?.[idx] ?? 'neutral')}`}
														>
															{row.format(row.get(m))}
														</span>
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('charts.sessions')}</CardTitle>
							</CardHeader>
							<CardContent className="h-72 sm:h-96">
								<ResponsiveContainer width="100%" height="100%">
									<ReLineChart data={sessionsChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="day" tick={{ fontSize: 11 }} />
										<YAxis tick={{ fontSize: 11 }} />
										<Tooltip />
										<Legend />
										{metrics.map((m) => (
											<Line
												key={m.projectId}
												type="monotone"
												dataKey={m.projectName}
												stroke={m.color}
												strokeWidth={2}
												dot={false}
												connectNulls
											/>
										))}
									</ReLineChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('charts.clicks')}</CardTitle>
							</CardHeader>
							<CardContent className="h-72 sm:h-96">
								<ResponsiveContainer width="100%" height="100%">
									<ReLineChart data={clicksChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="day" tick={{ fontSize: 11 }} />
										<YAxis tick={{ fontSize: 11 }} />
										<Tooltip />
										<Legend />
										{metrics.map((m) => (
											<Line
												key={m.projectId}
												type="monotone"
												dataKey={m.projectName}
												stroke={m.color}
												strokeWidth={2}
												dot={false}
												connectNulls
											/>
										))}
									</ReLineChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('best.title')}</CardTitle>
							</CardHeader>
							<CardContent>
								<BestPerformersTable metrics={metrics} kpiRows={kpiRows} />
							</CardContent>
						</Card>
					</>
				)}
			</div>
		</AppShell>
	);
};

const BestPerformersTable = ({ metrics, kpiRows }: { metrics: ProjectMetrics[]; kpiRows: KpiRowDef[] }) => {
	const { t } = useTranslation('portfolioCompare');
	if (metrics.length === 0) {
		return <p className="text-sm text-muted-foreground">{t('best.empty')}</p>;
	}
	const ranking = kpiRows.map((row) => {
		const values = metrics.map((m) => ({ project: m, value: row.get(m) }));
		const numeric = values.filter((v): v is { project: ProjectMetrics; value: number } => v.value !== null);
		const sorted = [...numeric].sort((a, b) => (row.lowerIsBetter ? a.value - b.value : b.value - a.value));
		return { label: row.label, top: sorted[0] };
	});
	return (
		<ul className="flex flex-col gap-1 text-sm">
			{ranking.map((r) => (
				<li
					key={r.label}
					className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-b-0"
				>
					<span className="text-muted-foreground">{r.label}</span>
					<span className="flex items-center gap-2 font-medium">
						{r.top ? (
							<Badge style={{ backgroundColor: `${r.top.project.color}20`, color: r.top.project.color }}>
								{r.top.project.projectName}
							</Badge>
						) : (
							<span className="text-muted-foreground">—</span>
						)}
					</span>
				</li>
			))}
		</ul>
	);
};
