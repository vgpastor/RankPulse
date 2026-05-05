import { Drawer, EmptyState, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
	CartesianGrid,
	Line,
	ReferenceLine,
	LineChart as ReLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { api } from '../lib/api.js';

export interface KeywordHistoryDrawerProps {
	open: boolean;
	onClose: () => void;
	trackedKeywordId: string | null;
	phrase: string | null;
}

interface ChartPoint {
	date: string;
	position: number | null;
}

/**
 * BACKLOG A7. Renders the position history of a tracked keyword as a line
 * chart. Y-axis is INVERTED (lower values = better, position 1 at the top).
 * Null positions ("not ranked") are dropped from the line so the trend
 * stays readable.
 */
export const KeywordHistoryDrawer = ({
	open,
	onClose,
	trackedKeywordId,
	phrase,
}: KeywordHistoryDrawerProps) => {
	const historyQuery = useQuery({
		queryKey: ['tracked-keyword', trackedKeywordId, 'history'],
		queryFn: () => api.rankTracking.history(trackedKeywordId ?? ''),
		enabled: open && Boolean(trackedKeywordId),
	});

	const chartData: ChartPoint[] = useMemo(
		() =>
			(historyQuery.data ?? [])
				.map((entry) => ({ date: entry.observedAt.slice(0, 10), position: entry.position }))
				.filter((p): p is ChartPoint & { position: number } => p.position !== null),
		[historyQuery.data],
	);

	const ranked = chartData.filter((p) => p.position !== null);
	const maxPosition = ranked.length > 0 ? Math.max(...ranked.map((p) => p.position ?? 0), 10) : 10;

	return (
		<Drawer open={open} onClose={onClose} title="Position history" description={phrase ?? undefined}>
			{historyQuery.isLoading ? (
				<div className="flex justify-center py-6">
					<Spinner />
				</div>
			) : historyQuery.isError ? (
				<p className="text-sm text-destructive" role="alert">
					{historyQuery.error instanceof Error ? historyQuery.error.message : 'Failed to load history'}
				</p>
			) : chartData.length === 0 ? (
				<EmptyState
					title="No observations yet"
					description="Once a SERP fetch runs for this keyword (Schedules → Run now), the line will appear."
				/>
			) : (
				<div className="h-72 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<ReLineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="date" tick={{ fontSize: 11 }} />
							<YAxis
								reversed
								domain={[1, Math.max(maxPosition, 10)]}
								tick={{ fontSize: 11 }}
								label={{ value: 'position', angle: -90, position: 'insideLeft', fontSize: 11 }}
							/>
							<Tooltip />
							<ReferenceLine
								y={10}
								stroke="#94a3b8"
								strokeDasharray="4 4"
								label={{ value: 'page 1', fontSize: 10 }}
							/>
							<Line type="monotone" dataKey="position" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
						</ReLineChart>
					</ResponsiveContainer>
				</div>
			)}
		</Drawer>
	);
};
