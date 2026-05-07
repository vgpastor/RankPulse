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
import { useParams } from '@tanstack/react-router';
import { Activity, Eye, Globe2, MonitorSmartphone, MousePointerClick, Target, Users } from 'lucide-react';
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

type RangePreset = '7d' | '28d' | '90d';

const RANGE_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90 };

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const isoDayShift = (days: number): string => {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return isoDay(d);
};

interface Ga4Row {
	observedDate: string;
	dimensions: Record<string, string>;
	metrics: Record<string, number>;
}

interface DailyAgg {
	day: string;
	sessions: number;
	users: number;
	pageviews: number;
	engagedSessions: number;
	conversions: number;
	revenue: number;
}

interface DimensionAgg {
	key: string;
	sessions: number;
	users: number;
	conversions: number;
}

const aggregateByDay = (rows: Ga4Row[]): DailyAgg[] => {
	const buckets = new Map<string, DailyAgg>();
	for (const r of rows) {
		const day = r.observedDate.slice(0, 10);
		const cur = buckets.get(day) ?? {
			day,
			sessions: 0,
			users: 0,
			pageviews: 0,
			engagedSessions: 0,
			conversions: 0,
			revenue: 0,
		};
		cur.sessions += r.metrics.sessions ?? 0;
		cur.users += r.metrics.totalUsers ?? r.metrics.activeUsers ?? 0;
		cur.pageviews += r.metrics.screenPageViews ?? 0;
		cur.engagedSessions += r.metrics.engagedSessions ?? 0;
		cur.conversions += r.metrics.conversions ?? 0;
		cur.revenue += r.metrics.totalRevenue ?? 0;
		buckets.set(day, cur);
	}
	return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
};

const aggregateByDimension = (rows: Ga4Row[], dimensionKey: string): DimensionAgg[] => {
	const buckets = new Map<string, DimensionAgg>();
	for (const r of rows) {
		const key = r.dimensions[dimensionKey];
		if (!key) continue;
		const cur = buckets.get(key) ?? { key, sessions: 0, users: 0, conversions: 0 };
		cur.sessions += r.metrics.sessions ?? 0;
		cur.users += r.metrics.totalUsers ?? r.metrics.activeUsers ?? 0;
		cur.conversions += r.metrics.conversions ?? 0;
		buckets.set(key, cur);
	}
	return [...buckets.values()].sort((a, b) => b.sessions - a.sessions);
};

const formatCount = (value: number): string => Math.round(value).toLocaleString();

export const Ga4TrafficPage = () => {
	const { id: projectId, propertyId } = useParams({ from: '/projects/$id/ga4/$propertyId' });
	const { t } = useTranslation('ga4');
	const [range, setRange] = useState<RangePreset>('28d');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});

	const fromDate = isoDayShift(RANGE_DAYS[range]);
	const toDate = isoDay(new Date());

	const metricsQuery = useQuery({
		queryKey: ['ga4-property', propertyId, 'metrics', fromDate, toDate],
		queryFn: () => api.ga4.metrics(propertyId, { from: fromDate, to: toDate }),
	});

	const rows: Ga4Row[] = metricsQuery.data ?? [];

	const aggregated = useMemo(() => aggregateByDay(rows), [rows]);

	const totals = useMemo(() => {
		return aggregated.reduce(
			(acc, p) => ({
				sessions: acc.sessions + p.sessions,
				users: acc.users + p.users,
				pageviews: acc.pageviews + p.pageviews,
				engagedSessions: acc.engagedSessions + p.engagedSessions,
				conversions: acc.conversions + p.conversions,
				revenue: acc.revenue + p.revenue,
			}),
			{ sessions: 0, users: 0, pageviews: 0, engagedSessions: 0, conversions: 0, revenue: 0 },
		);
	}, [aggregated]);

	const byCountry = useMemo(() => aggregateByDimension(rows, 'country').slice(0, 10), [rows]);
	const byDevice = useMemo(() => aggregateByDimension(rows, 'deviceCategory'), [rows]);
	const bySource = useMemo(() => aggregateByDimension(rows, 'sessionSource').slice(0, 10), [rows]);

	const distroColumns: DataTableColumn<DimensionAgg>[] = [
		{
			key: 'name',
			header: t('table.dimension'),
			cell: (row) => <span className="break-all font-medium">{row.key}</span>,
		},
		{
			key: 'sessions',
			header: t('table.sessions'),
			cell: (row) => <span className="tabular-nums">{formatCount(row.sessions)}</span>,
		},
		{
			key: 'users',
			header: t('table.users'),
			cell: (row) => <span className="tabular-nums">{formatCount(row.users)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'conv',
			header: t('table.conversions'),
			cell: (row) => <span className="tabular-nums">{formatCount(row.conversions)}</span>,
			hideOnMobile: true,
		},
	];

	if (projectQuery.isLoading || metricsQuery.isLoading) {
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
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('trafficTitle')}</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t(`range.${range}`)}
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

				{aggregated.length === 0 ? (
					<EmptyState title={t('empty.title')} description={t('empty.description')} />
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<KpiCard
								label={t('kpi.sessions')}
								icon={<Activity size={14} />}
								value={formatCount(totals.sessions)}
								sparkline={{
									values: aggregated.map((p) => p.sessions),
									ariaLabel: t('kpi.sessionsSparkline'),
								}}
							/>
							<KpiCard
								label={t('kpi.users')}
								icon={<Users size={14} />}
								value={formatCount(totals.users)}
								sparkline={{ values: aggregated.map((p) => p.users), ariaLabel: t('kpi.usersSparkline') }}
							/>
							<KpiCard
								label={t('kpi.pageviews')}
								icon={<Eye size={14} />}
								value={formatCount(totals.pageviews)}
								sparkline={{
									values: aggregated.map((p) => p.pageviews),
									ariaLabel: t('kpi.pageviewsSparkline'),
								}}
							/>
							<KpiCard
								label={t('kpi.conversions')}
								icon={<Target size={14} />}
								value={formatCount(totals.conversions)}
								hint={
									totals.revenue > 0 ? t('kpi.revenueHint', { amount: totals.revenue.toFixed(2) }) : undefined
								}
								sparkline={{
									values: aggregated.map((p) => p.conversions),
									ariaLabel: t('kpi.conversionsSparkline'),
								}}
							/>
						</div>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('chart.title')}</CardTitle>
							</CardHeader>
							<CardContent className="h-72 sm:h-96">
								<ResponsiveContainer width="100%" height="100%">
									<ReLineChart data={aggregated} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="day" tick={{ fontSize: 11 }} />
										<YAxis yAxisId="left" tick={{ fontSize: 11 }} />
										<YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
										<Tooltip />
										<Legend />
										<Line
											yAxisId="left"
											type="monotone"
											dataKey="sessions"
											stroke="#3b82f6"
											strokeWidth={2}
											dot={false}
										/>
										<Line
											yAxisId="left"
											type="monotone"
											dataKey="users"
											stroke="#22c55e"
											strokeWidth={2}
											dot={false}
										/>
										<Line
											yAxisId="right"
											type="monotone"
											dataKey="pageviews"
											stroke="#f59e0b"
											strokeWidth={2}
											dot={false}
										/>
									</ReLineChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Globe2 size={14} className="text-muted-foreground" />
										{t('countries.title')}
									</CardTitle>
								</CardHeader>
								<CardContent>
									{byCountry.length === 0 ? (
										<p className="text-sm text-muted-foreground">{t('countries.empty')}</p>
									) : (
										<DistributionList rows={byCountry} totalSessions={totals.sessions} variant="country" />
									)}
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<MonitorSmartphone size={14} className="text-muted-foreground" />
										{t('devices.title')}
									</CardTitle>
								</CardHeader>
								<CardContent>
									{byDevice.length === 0 ? (
										<p className="text-sm text-muted-foreground">{t('devices.empty')}</p>
									) : (
										<DistributionList rows={byDevice} totalSessions={totals.sessions} variant="device" />
									)}
								</CardContent>
							</Card>
						</div>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<MousePointerClick size={14} className="text-muted-foreground" />
									{t('sources.title')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<DataTable
									columns={distroColumns}
									rows={bySource}
									rowKey={(row) => `s-${row.key}`}
									empty={t('sources.empty')}
								/>
							</CardContent>
						</Card>
					</>
				)}
			</div>
		</AppShell>
	);
};

const DistributionList = ({
	rows,
	totalSessions,
	variant,
}: {
	rows: DimensionAgg[];
	totalSessions: number;
	variant: 'country' | 'device';
}) => (
	<ul className="flex flex-col gap-3">
		{rows.map((row) => {
			const pct = totalSessions === 0 ? 0 : (row.sessions / totalSessions) * 100;
			return (
				<li key={row.key} className="flex flex-col gap-1">
					<div className="flex items-center justify-between gap-2 text-sm">
						<span className="flex items-center gap-2">
							{variant === 'country' ? (
								<Badge variant="secondary">{row.key.toUpperCase()}</Badge>
							) : (
								<Badge>{row.key}</Badge>
							)}
							<span className="tabular-nums text-xs text-muted-foreground">
								{formatCount(row.sessions)} sessions
							</span>
						</span>
						<span className="tabular-nums text-xs font-medium">{pct.toFixed(1)}%</span>
					</div>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
						<div className="h-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
					</div>
				</li>
			);
		})}
	</ul>
);
