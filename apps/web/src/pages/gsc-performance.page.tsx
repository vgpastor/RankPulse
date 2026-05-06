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
import { Globe2, MonitorSmartphone, MousePointerClick, Percent, Search, TrendingUp } from 'lucide-react';
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

type RangePreset = '7d' | '28d' | '90d' | '12mo';

const RANGE_DAYS: Record<RangePreset, number> = {
	'7d': 7,
	'28d': 28,
	'90d': 90,
	'12mo': 365,
};

interface DailyAgg {
	day: string;
	clicks: number;
	impressions: number;
	avgPosition: number;
	avgCtrPct: number;
}

interface DimensionAgg {
	key: string;
	clicks: number;
	impressions: number;
	ctrPct: number;
	avgPosition: number;
}

const aggregateByDay = (
	rows: { observedAt: string; clicks: number; impressions: number; position: number }[],
): DailyAgg[] => {
	const buckets = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();
	for (const r of rows) {
		const day = r.observedAt.slice(0, 10);
		const cur = buckets.get(day) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
		cur.clicks += r.clicks;
		cur.impressions += r.impressions;
		cur.positionWeighted += r.position * r.impressions;
		buckets.set(day, cur);
	}
	return [...buckets.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([day, b]) => ({
			day,
			clicks: b.clicks,
			impressions: b.impressions,
			avgPosition: b.impressions > 0 ? b.positionWeighted / b.impressions : 0,
			avgCtrPct: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0,
		}));
};

interface PerformanceRow {
	observedAt: string;
	query: string | null;
	page: string | null;
	country: string | null;
	device: string | null;
	clicks: number;
	impressions: number;
	position: number;
}

const aggregateByDimension = (
	source: PerformanceRow[],
	keyFn: (row: PerformanceRow) => string | null,
): DimensionAgg[] => {
	const buckets = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();
	for (const r of source) {
		const key = keyFn(r);
		if (!key) continue;
		const cur = buckets.get(key) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
		cur.clicks += r.clicks;
		cur.impressions += r.impressions;
		cur.positionWeighted += r.position * r.impressions;
		buckets.set(key, cur);
	}
	return [...buckets.entries()]
		.map(([key, b]) => ({
			key,
			clicks: b.clicks,
			impressions: b.impressions,
			ctrPct: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0,
			avgPosition: b.impressions > 0 ? b.positionWeighted / b.impressions : 0,
		}))
		.sort((a, b) => b.clicks - a.clicks);
};

const filterByRange = <T extends { observedAt: string }>(rows: T[], days: number): T[] => {
	const cutoff = new Date();
	cutoff.setUTCDate(cutoff.getUTCDate() - days);
	const cutoffIso = cutoff.toISOString();
	return rows.filter((r) => r.observedAt >= cutoffIso);
};

const formatCount = (value: number): string => Math.round(value).toLocaleString();

const formatPos = (value: number): string => (value > 0 ? value.toFixed(1) : '—');

export const GscPerformancePage = () => {
	const { id: projectId, propertyId } = useParams({ from: '/projects/$id/gsc/$propertyId' });
	const { t } = useTranslation('gscPerformance');
	const [range, setRange] = useState<RangePreset>('28d');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const performanceQuery = useQuery({
		queryKey: ['gsc-property', propertyId, 'performance'],
		queryFn: () => api.gsc.performance(propertyId),
	});

	const rangeDays = RANGE_DAYS[range];

	const filtered = useMemo(
		() => filterByRange(performanceQuery.data ?? [], rangeDays),
		[performanceQuery.data, rangeDays],
	);

	const aggregated = useMemo(() => aggregateByDay(filtered), [filtered]);

	const totals = useMemo(() => {
		const totalClicks = filtered.reduce((acc, r) => acc + r.clicks, 0);
		const totalImpressions = filtered.reduce((acc, r) => acc + r.impressions, 0);
		const positionWeighted = filtered.reduce((acc, r) => acc + r.position * r.impressions, 0);
		return {
			clicks: totalClicks,
			impressions: totalImpressions,
			ctrPct: totalImpressions === 0 ? 0 : (totalClicks / totalImpressions) * 100,
			avgPosition: totalImpressions === 0 ? 0 : positionWeighted / totalImpressions,
		};
	}, [filtered]);

	const topQueries = useMemo(() => aggregateByDimension(filtered, (r) => r.query).slice(0, 10), [filtered]);
	const topPages = useMemo(() => aggregateByDimension(filtered, (r) => r.page).slice(0, 10), [filtered]);
	const topCountries = useMemo(
		() => aggregateByDimension(filtered, (r) => r.country).slice(0, 10),
		[filtered],
	);
	const topDevices = useMemo(() => aggregateByDimension(filtered, (r) => r.device), [filtered]);

	const dimensionColumns = (label: string): DataTableColumn<DimensionAgg>[] => [
		{
			key: 'name',
			header: label,
			cell: (row) => <span className="break-all font-medium">{row.key}</span>,
		},
		{
			key: 'clicks',
			header: t('table.clicks'),
			cell: (row) => <span className="tabular-nums">{formatCount(row.clicks)}</span>,
		},
		{
			key: 'impressions',
			header: t('table.impressions'),
			cell: (row) => <span className="tabular-nums">{formatCount(row.impressions)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'ctr',
			header: t('table.ctr'),
			cell: (row) => <span className="tabular-nums">{row.ctrPct.toFixed(2)}%</span>,
			hideOnMobile: true,
		},
		{
			key: 'position',
			header: t('table.position'),
			cell: (row) => <span className="tabular-nums">{formatPos(row.avgPosition)}</span>,
		},
	];

	if (projectQuery.isLoading || performanceQuery.isLoading) {
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
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('title')}</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t(`range.${range}`)}
						</p>
					</div>
					<div className="flex flex-wrap gap-1" role="tablist" aria-label={t('rangeLabel')}>
						{(['7d', '28d', '90d', '12mo'] as RangePreset[]).map((preset) => (
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
								label={t('kpi.clicks')}
								icon={<MousePointerClick size={14} />}
								value={formatCount(totals.clicks)}
								sparkline={{ values: aggregated.map((p) => p.clicks), ariaLabel: t('kpi.clicksSparkline') }}
							/>
							<KpiCard
								label={t('kpi.impressions')}
								icon={<TrendingUp size={14} />}
								value={formatCount(totals.impressions)}
								sparkline={{
									values: aggregated.map((p) => p.impressions),
									ariaLabel: t('kpi.impressionsSparkline'),
								}}
							/>
							<KpiCard
								label={t('kpi.ctr')}
								icon={<Percent size={14} />}
								value={`${totals.ctrPct.toFixed(2)}%`}
								sparkline={{ values: aggregated.map((p) => p.avgCtrPct), ariaLabel: t('kpi.ctrSparkline') }}
							/>
							<KpiCard
								label={t('kpi.avgPosition')}
								icon={<Search size={14} />}
								value={formatPos(totals.avgPosition)}
								hint={t('kpi.avgPositionHint')}
								sparkline={{
									values: aggregated.map((p) => p.avgPosition),
									ariaLabel: t('kpi.positionSparkline'),
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
											dataKey="clicks"
											stroke="#22c55e"
											strokeWidth={2}
											dot={false}
										/>
										<Line
											yAxisId="right"
											type="monotone"
											dataKey="impressions"
											stroke="#3b82f6"
											strokeWidth={2}
											dot={false}
										/>
										<Line
											yAxisId="left"
											type="monotone"
											dataKey="avgCtrPct"
											stroke="#f59e0b"
											strokeWidth={2}
											dot={false}
										/>
										<Line
											yAxisId="right"
											type="monotone"
											dataKey="avgPosition"
											stroke="#a855f7"
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
									<CardTitle className="text-base">{t('topQueries.title')}</CardTitle>
								</CardHeader>
								<CardContent>
									<DataTable
										columns={dimensionColumns(t('topQueries.column'))}
										rows={topQueries}
										rowKey={(row) => `q-${row.key}`}
										empty={t('topQueries.empty')}
									/>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle className="text-base">{t('topPages.title')}</CardTitle>
								</CardHeader>
								<CardContent>
									<DataTable
										columns={dimensionColumns(t('topPages.column'))}
										rows={topPages}
										rowKey={(row) => `p-${row.key}`}
										empty={t('topPages.empty')}
									/>
								</CardContent>
							</Card>
						</div>

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Globe2 size={14} className="text-muted-foreground" />
										{t('countries.title')}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<DistributionList
										rows={topCountries}
										totalImpressions={totals.impressions}
										variant="country"
									/>
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
									<DistributionList
										rows={topDevices}
										totalImpressions={totals.impressions}
										variant="device"
									/>
								</CardContent>
							</Card>
						</div>
					</>
				)}
			</div>
		</AppShell>
	);
};

const DistributionList = ({
	rows,
	totalImpressions,
	variant,
}: {
	rows: DimensionAgg[];
	totalImpressions: number;
	variant: 'country' | 'device';
}) => {
	const { t } = useTranslation('gscPerformance');
	if (rows.length === 0) {
		return <p className="text-sm text-muted-foreground">{t(`${variant}.empty`)}</p>;
	}
	return (
		<ul className="flex flex-col gap-3">
			{rows.map((row) => {
				const pct = totalImpressions === 0 ? 0 : (row.impressions / totalImpressions) * 100;
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
									{formatCount(row.clicks)} clicks · {formatCount(row.impressions)} impr.
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
};
