import type { SearchConsoleInsightsContracts } from '@rankpulse/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type ForecastPoint = SearchConsoleInsightsContracts.ForecastPointDto;

const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
};

const formatDelta = (pct: number | null): string => {
	if (pct === null) return '—';
	const sign = pct > 0 ? '+' : '';
	return `${sign}${pct}%`;
};

/**
 * Renders a stacked-line chart of `clicks` (observed vs forecast) inside a
 * single SVG with a subtle vertical separator at the boundary. Lightweight
 * — built ad-hoc rather than pulled from a charting library to keep the
 * cockpit bundle small. If we ever need axes / tooltips / zoom, swap to
 * Recharts (already a transitive dep).
 */
const ForecastChart = ({ points, height = 220 }: { points: ForecastPoint[]; height?: number }) => {
	if (points.length < 2) return null;
	const max = Math.max(1, ...points.map((p) => p.clicks));
	const width = 800;
	const stepX = width / (points.length - 1);
	const scaleY = (v: number): number => height - 6 - (v / max) * (height - 12);

	const observed = points.filter((p) => p.type === 'observed');
	const forecast = points.filter((p) => p.type === 'forecast');
	const observedEndIdx = observed.length - 1;
	const splitX = observedEndIdx * stepX;

	const buildPath = (slice: ForecastPoint[], offset: number): string => {
		if (slice.length === 0) return '';
		return slice
			.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i + offset) * stepX} ${scaleY(p.clicks)}`)
			.join(' ');
	};

	return (
		<svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="overflow-visible">
			<title>Daily clicks: observed and forecast</title>
			{/* Boundary marker */}
			{forecast.length > 0 ? (
				<line
					x1={splitX}
					x2={splitX}
					y1={6}
					y2={height - 6}
					stroke="currentColor"
					strokeOpacity={0.15}
					strokeDasharray="4 4"
				/>
			) : null}
			<path d={buildPath(observed, 0)} fill="none" stroke="rgb(99, 102, 241)" strokeWidth={2.5} />
			<path
				d={buildPath(forecast, observedEndIdx)}
				fill="none"
				stroke="rgb(217, 119, 6)"
				strokeWidth={2}
				strokeDasharray="6 4"
			/>
		</svg>
	);
};

export const Forecast90dPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/forecast-90d' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const forecastQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'forecast-90d'],
		queryFn: () => api.cockpit.forecast90d(projectId),
	});

	if (projectQuery.isLoading || forecastQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const data = forecastQuery.data;
	const project = projectQuery.data;
	const points = data?.points ?? [];
	const deltaPct = data?.deltaPct ?? null;

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
						{deltaPct !== null && deltaPct < 0 ? (
							<TrendingDown size={20} className="text-red-600" />
						) : (
							<TrendingUp size={20} className="text-emerald-600" />
						)}
						{t('cockpit:forecast90dPage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:forecast90dPage.subtitle')}
					</p>
				</header>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<KpiCard
						label={t('cockpit:forecast90dPage.kpi.history')}
						value={data?.historyClicksTotal === undefined ? '—' : formatNumber(data.historyClicksTotal)}
						hint={t('cockpit:forecast90dPage.kpi.historyHint', { days: data?.historyDays ?? 90 })}
					/>
					<KpiCard
						label={t('cockpit:forecast90dPage.kpi.forecast')}
						value={data?.forecastClicksTotal === undefined ? '—' : formatNumber(data.forecastClicksTotal)}
						hint={t('cockpit:forecast90dPage.kpi.forecastHint', { days: data?.forecastDays ?? 90 })}
					/>
					<KpiCard
						label={t('cockpit:forecast90dPage.kpi.delta')}
						value={formatDelta(deltaPct)}
						hint={t('cockpit:forecast90dPage.kpi.deltaHint')}
					/>
				</div>

				{points.length === 0 ? (
					<EmptyState
						icon={<TrendingUp size={32} />}
						title={t('cockpit:forecast90dPage.empty')}
						description={t('cockpit:forecast90dPage.emptyDescription')}
					/>
				) : (
					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-3">
							<div>
								<CardTitle className="text-base">{t('cockpit:forecast90dPage.chartTitle')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('cockpit:forecast90dPage.chartHint')}</p>
							</div>
							<div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
								<Badge variant="default" className="bg-indigo-600">
									{t('cockpit:forecast90dPage.legend.observed')}
								</Badge>
								<Badge variant="warning">{t('cockpit:forecast90dPage.legend.forecast')}</Badge>
							</div>
						</CardHeader>
						<CardContent>
							<ForecastChart points={points} />
							<p className="mt-3 text-xs text-muted-foreground">{t('cockpit:forecast90dPage.disclaimer')}</p>
						</CardContent>
					</Card>
				)}
			</div>
		</AppShell>
	);
};
