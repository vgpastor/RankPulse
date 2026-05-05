import { Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
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

interface AggregatedPoint {
	day: string;
	clicks: number;
	impressions: number;
	avgPosition: number;
	avgCtr: number;
}

/**
 * Aggregates the GSC observation rows into one row per day. The API may
 * return many rows per day (one per dimension combo); the chart needs the
 * trend over time so we sum clicks/impressions and weight position by
 * impressions for a single line.
 */
const aggregateByDay = (
	rows: { observedAt: string; clicks: number; impressions: number; ctr: number; position: number }[],
): AggregatedPoint[] => {
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
			avgCtr: b.impressions > 0 ? b.clicks / b.impressions : 0,
		}));
};

export const GscPerformancePage = () => {
	const { id: projectId, propertyId } = useParams({ from: '/projects/$id/gsc/$propertyId' });

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const performanceQuery = useQuery({
		queryKey: ['gsc-property', propertyId, 'performance'],
		queryFn: () => api.gsc.performance(propertyId),
	});

	const aggregated = useMemo(() => aggregateByDay(performanceQuery.data ?? []), [performanceQuery.data]);
	const totalClicks = aggregated.reduce((acc, p) => acc + p.clicks, 0);
	const totalImpressions = aggregated.reduce((acc, p) => acc + p.impressions, 0);
	const overallCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

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
				<header>
					<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">GSC performance</h1>
					<p className="text-sm text-muted-foreground">{projectQuery.data?.name} · last 30 days</p>
				</header>

				{aggregated.length === 0 ? (
					<EmptyState
						title="No data yet"
						description="Schedule a GSC search-analytics fetch from the Schedules page to populate this view."
					/>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
							<MetricCard label="Clicks" value={totalClicks.toLocaleString()} />
							<MetricCard label="Impressions" value={totalImpressions.toLocaleString()} />
							<MetricCard label="CTR" value={`${(overallCtr * 100).toFixed(2)}%`} />
							<MetricCard
								label="Avg. position"
								value={(
									aggregated.reduce((a, p) => a + p.avgPosition * p.impressions, 0) /
									Math.max(totalImpressions, 1)
								).toFixed(1)}
							/>
						</div>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">Clicks vs Impressions</CardTitle>
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
										<Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} />
										<Line
											yAxisId="right"
											type="monotone"
											dataKey="impressions"
											stroke="#3b82f6"
											strokeWidth={2}
										/>
									</ReLineChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>
					</>
				)}
			</div>
		</AppShell>
	);
};

const MetricCard = ({ label, value }: { label: string; value: string }) => (
	<Card>
		<CardContent className="flex flex-col gap-1 p-4">
			<span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
			<span className="text-xl font-semibold">{value}</span>
		</CardContent>
	</Card>
);
