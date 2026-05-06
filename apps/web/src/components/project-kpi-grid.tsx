import type { ProjectManagementContracts } from '@rankpulse/contracts';
import { KpiCard } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Activity, Eye, Globe2, LineChart, MousePointerClick, Radar, Search, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';

const WINDOW_DAYS = 30;
const RECENT_DAYS = 7;

const today = (): Date => new Date();

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const daysAgo = (days: number): Date => {
	const d = today();
	d.setUTCDate(d.getUTCDate() - days);
	return d;
};

const buildDailyBuckets = (windowDays: number): Map<string, number> => {
	const buckets = new Map<string, number>();
	for (let i = windowDays - 1; i >= 0; i -= 1) buckets.set(isoDay(daysAgo(i)), 0);
	return buckets;
};

const dailyToSparkline = (buckets: Map<string, number>): number[] => Array.from(buckets.values());

interface DeltaResult {
	delta: number;
	pct: number;
}

const computeDelta = (values: readonly number[], recentWindow: number): DeltaResult => {
	if (values.length < recentWindow * 2) return { delta: 0, pct: 0 };
	const recent = values.slice(-recentWindow).reduce((acc, v) => acc + v, 0);
	const previous = values.slice(-recentWindow * 2, -recentWindow).reduce((acc, v) => acc + v, 0);
	const delta = recent - previous;
	const pct = previous === 0 ? (recent > 0 ? 1 : 0) : delta / previous;
	return { delta, pct };
};

const formatCount = (value: number): string => {
	if (!Number.isFinite(value)) return '—';
	if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
	if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
	return Math.round(value).toLocaleString();
};

const formatPct = (value: number): string => {
	const sign = value > 0 ? '+' : '';
	return `${sign}${(value * 100).toFixed(1)}%`;
};

const trendOf = (delta: number): 'up' | 'down' | 'flat' => {
	if (delta > 0) return 'up';
	if (delta < 0) return 'down';
	return 'flat';
};

const fromDate = isoDay(daysAgo(WINDOW_DAYS - 1));
const toDate = isoDay(today());

interface UseAggregatedSeriesArgs<T> {
	enabled: boolean;
	queryKey: readonly unknown[];
	queryFn: () => Promise<T>;
}

const useChainedQuery = <T,>({ enabled, queryKey, queryFn }: UseAggregatedSeriesArgs<T>) =>
	useQuery({ enabled, queryKey, queryFn, staleTime: 60_000 });

export interface ProjectKpiGridProps {
	project: ProjectManagementContracts.ProjectDto;
}

export const ProjectKpiGrid = ({ project }: ProjectKpiGridProps) => {
	const navigate = useNavigate();
	const { t } = useTranslation('projectKpis');
	const projectId = project.id;

	const ga4Properties = useChainedQuery({
		queryKey: ['project', projectId, 'ga4'],
		queryFn: () => api.ga4.listForProject(projectId),
		enabled: true,
	});
	const gscProperties = useChainedQuery({
		queryKey: ['project', projectId, 'gsc'],
		queryFn: () => api.gsc.listForProject(projectId),
		enabled: true,
	});
	const bingProperties = useChainedQuery({
		queryKey: ['project', projectId, 'bing'],
		queryFn: () => api.bing.listForProject(projectId),
		enabled: true,
	});
	const radarDomains = useChainedQuery({
		queryKey: ['project', projectId, 'radar'],
		queryFn: () => api.radar.listForProject(projectId),
		enabled: true,
	});
	const rankings = useChainedQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
		enabled: true,
	});
	const brandPrompts = useChainedQuery({
		queryKey: ['project', projectId, 'brand-prompts'],
		queryFn: () => api.aiSearch.listPrompts(projectId),
		enabled: true,
	});

	const firstGa4Id = ga4Properties.data?.[0]?.id ?? null;
	const ga4MetricsForFirst = useChainedQuery({
		queryKey: ['project', projectId, 'ga4', 'metrics', fromDate, toDate, firstGa4Id],
		queryFn: () => api.ga4.metrics(firstGa4Id ?? '', { from: fromDate, to: toDate }),
		enabled: firstGa4Id !== null,
	});

	const firstGscId = gscProperties.data?.[0]?.id ?? null;
	const gscPerfForFirst = useChainedQuery({
		queryKey: ['project', projectId, 'gsc', 'performance', firstGscId],
		queryFn: () => api.gsc.performance(firstGscId ?? ''),
		enabled: firstGscId !== null,
	});

	const firstBingId = bingProperties.data?.[0]?.id ?? null;
	const bingTrafficForFirst = useChainedQuery({
		queryKey: ['project', projectId, 'bing', 'traffic', fromDate, toDate, firstBingId],
		queryFn: () => api.bing.traffic(firstBingId ?? '', { from: fromDate, to: toDate }),
		enabled: firstBingId !== null,
	});

	const firstRadarId = radarDomains.data?.[0]?.id ?? null;
	const radarHistoryForFirst = useChainedQuery({
		queryKey: ['project', projectId, 'radar', 'history', fromDate, toDate, firstRadarId],
		queryFn: () => api.radar.history(firstRadarId ?? '', { from: fromDate, to: toDate }),
		enabled: firstRadarId !== null,
	});

	const ga4 = useMemo(() => {
		const sessionsBuckets = buildDailyBuckets(WINDOW_DAYS);
		const usersBuckets = buildDailyBuckets(WINDOW_DAYS);
		const pageviewsBuckets = buildDailyBuckets(WINDOW_DAYS);
		for (const row of ga4MetricsForFirst.data ?? []) {
			const day = row.observedDate.slice(0, 10);
			if (!sessionsBuckets.has(day)) continue;
			sessionsBuckets.set(day, (sessionsBuckets.get(day) ?? 0) + (row.metrics.sessions ?? 0));
			usersBuckets.set(
				day,
				(usersBuckets.get(day) ?? 0) + (row.metrics.totalUsers ?? row.metrics.activeUsers ?? 0),
			);
			pageviewsBuckets.set(day, (pageviewsBuckets.get(day) ?? 0) + (row.metrics.screenPageViews ?? 0));
		}
		const sessions = dailyToSparkline(sessionsBuckets);
		const users = dailyToSparkline(usersBuckets);
		const pageviews = dailyToSparkline(pageviewsBuckets);
		return {
			sessions,
			users,
			pageviews,
			sessionsTotal: sessions.reduce((a, b) => a + b, 0),
			usersTotal: users.reduce((a, b) => a + b, 0),
			pageviewsTotal: pageviews.reduce((a, b) => a + b, 0),
			sessionsDelta: computeDelta(sessions, RECENT_DAYS),
		};
	}, [ga4MetricsForFirst.data]);

	const gsc = useMemo(() => {
		const clicksBuckets = buildDailyBuckets(WINDOW_DAYS);
		const impressionsBuckets = buildDailyBuckets(WINDOW_DAYS);
		const positionWeightedBuckets = buildDailyBuckets(WINDOW_DAYS);
		const positionWeightBuckets = buildDailyBuckets(WINDOW_DAYS);
		for (const row of gscPerfForFirst.data ?? []) {
			const day = row.observedAt.slice(0, 10);
			if (!clicksBuckets.has(day)) continue;
			clicksBuckets.set(day, (clicksBuckets.get(day) ?? 0) + row.clicks);
			impressionsBuckets.set(day, (impressionsBuckets.get(day) ?? 0) + row.impressions);
			positionWeightedBuckets.set(
				day,
				(positionWeightedBuckets.get(day) ?? 0) + row.position * row.impressions,
			);
			positionWeightBuckets.set(day, (positionWeightBuckets.get(day) ?? 0) + row.impressions);
		}
		const clicks = dailyToSparkline(clicksBuckets);
		const impressions = dailyToSparkline(impressionsBuckets);
		const totalImpressions = impressions.reduce((a, b) => a + b, 0);
		const totalClicks = clicks.reduce((a, b) => a + b, 0);
		const positionWeightedSum = Array.from(positionWeightedBuckets.values()).reduce((a, b) => a + b, 0);
		const ctrPct = totalImpressions === 0 ? 0 : (totalClicks / totalImpressions) * 100;
		const avgPosition = totalImpressions === 0 ? null : positionWeightedSum / totalImpressions;
		return {
			clicks,
			impressions,
			ctrPct,
			avgPosition,
			totalClicks,
			totalImpressions,
			clicksDelta: computeDelta(clicks, RECENT_DAYS),
		};
	}, [gscPerfForFirst.data]);

	const rankingsKpi = useMemo(() => {
		const obs = rankings.data ?? [];
		if (obs.length === 0) return { avgPosition: null as number | null, count: 0 };
		const valid = obs.filter((r) => r.position !== null);
		if (valid.length === 0) return { avgPosition: null, count: obs.length };
		const sum = valid.reduce((acc, r) => acc + (r.position ?? 0), 0);
		return { avgPosition: sum / valid.length, count: obs.length };
	}, [rankings.data]);

	const bingKpi = useMemo(() => {
		const clicksBuckets = buildDailyBuckets(WINDOW_DAYS);
		const impressionsBuckets = buildDailyBuckets(WINDOW_DAYS);
		for (const row of bingTrafficForFirst.data ?? []) {
			const day = row.observedDate.slice(0, 10);
			if (!clicksBuckets.has(day)) continue;
			clicksBuckets.set(day, (clicksBuckets.get(day) ?? 0) + row.clicks);
			impressionsBuckets.set(day, (impressionsBuckets.get(day) ?? 0) + row.impressions);
		}
		const clicks = dailyToSparkline(clicksBuckets);
		const totalClicks = clicks.reduce((a, b) => a + b, 0);
		return { clicks, totalClicks, clicksDelta: computeDelta(clicks, RECENT_DAYS) };
	}, [bingTrafficForFirst.data]);

	const radarKpi = useMemo(() => {
		const rows = radarHistoryForFirst.data ?? [];
		if (rows.length === 0) return { rank: null as number | null, sparkline: [] as number[] };
		const sorted = [...rows].sort((a, b) => a.observedDate.localeCompare(b.observedDate));
		const best = sorted.reduce<number | null>((acc, row) => {
			if (row.rank === null) return acc;
			if (acc === null) return row.rank;
			return Math.min(acc, row.rank);
		}, null);
		const values = sorted.map((row) => (row.rank === null ? 0 : 1_000_000 - row.rank));
		return { rank: best, sparkline: values };
	}, [radarHistoryForFirst.data]);

	const aiPromptsCount = brandPrompts.data?.items?.length ?? 0;

	const goTo = (path: string): void => {
		void navigate({ to: path, params: { id: projectId } });
	};

	return (
		<section aria-label={t('sectionLabel')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<KpiCard
				label={t('ga4Sessions')}
				icon={<Activity size={14} />}
				value={
					ga4MetricsForFirst.isFetching && !ga4MetricsForFirst.data ? '…' : formatCount(ga4.sessionsTotal)
				}
				hint={t('windowHint', { days: WINDOW_DAYS })}
				loading={ga4Properties.isLoading || ga4MetricsForFirst.isLoading}
				delta={
					ga4.sessionsTotal > 0
						? {
								value: formatPct(ga4.sessionsDelta.pct),
								trend: trendOf(ga4.sessionsDelta.delta),
							}
						: undefined
				}
				sparkline={
					ga4.sessions.length > 0 ? { values: ga4.sessions, ariaLabel: t('ga4SessionsSparkline') } : undefined
				}
			/>
			<KpiCard
				label={t('gscClicks')}
				icon={<Search size={14} />}
				value={gscPerfForFirst.isFetching && !gscPerfForFirst.data ? '…' : formatCount(gsc.totalClicks)}
				hint={t('gscHint', {
					ctr: gsc.ctrPct.toFixed(1),
					position: gsc.avgPosition === null ? '—' : gsc.avgPosition.toFixed(1),
				})}
				loading={gscProperties.isLoading || gscPerfForFirst.isLoading}
				delta={
					gsc.totalClicks > 0
						? {
								value: formatPct(gsc.clicksDelta.pct),
								trend: trendOf(gsc.clicksDelta.delta),
							}
						: undefined
				}
				sparkline={
					gsc.clicks.length > 0 ? { values: gsc.clicks, ariaLabel: t('gscClicksSparkline') } : undefined
				}
				onClick={(() => {
					const first = gscProperties.data?.[0];
					if (!first) return undefined;
					return () =>
						void navigate({
							to: '/projects/$id/gsc/$propertyId',
							params: { id: projectId, propertyId: first.id },
						});
				})()}
			/>
			<KpiCard
				label={t('avgSerpPosition')}
				icon={<LineChart size={14} />}
				value={rankingsKpi.avgPosition === null ? '—' : `#${rankingsKpi.avgPosition.toFixed(1)}`}
				hint={t('rankingsHint', { count: rankingsKpi.count })}
				loading={rankings.isLoading}
				onClick={() => goTo('/projects/$id/rankings')}
			/>
			<KpiCard
				label={t('bingClicks')}
				icon={<Globe2 size={14} />}
				value={
					bingTrafficForFirst.isFetching && !bingTrafficForFirst.data ? '…' : formatCount(bingKpi.totalClicks)
				}
				hint={t('windowHint', { days: WINDOW_DAYS })}
				loading={bingProperties.isLoading || bingTrafficForFirst.isLoading}
				delta={
					bingKpi.totalClicks > 0
						? {
								value: formatPct(bingKpi.clicksDelta.pct),
								trend: trendOf(bingKpi.clicksDelta.delta),
							}
						: undefined
				}
				sparkline={
					bingKpi.clicks.length > 0
						? { values: bingKpi.clicks, ariaLabel: t('bingClicksSparkline') }
						: undefined
				}
			/>
			<KpiCard
				label={t('ga4Users')}
				icon={<Eye size={14} />}
				value={ga4MetricsForFirst.isFetching && !ga4MetricsForFirst.data ? '…' : formatCount(ga4.usersTotal)}
				hint={t('windowHint', { days: WINDOW_DAYS })}
				loading={ga4Properties.isLoading || ga4MetricsForFirst.isLoading}
				sparkline={
					ga4.users.length > 0 ? { values: ga4.users, ariaLabel: t('ga4UsersSparkline') } : undefined
				}
			/>
			<KpiCard
				label={t('ga4Pageviews')}
				icon={<MousePointerClick size={14} />}
				value={
					ga4MetricsForFirst.isFetching && !ga4MetricsForFirst.data ? '…' : formatCount(ga4.pageviewsTotal)
				}
				hint={t('windowHint', { days: WINDOW_DAYS })}
				loading={ga4Properties.isLoading || ga4MetricsForFirst.isLoading}
				sparkline={
					ga4.pageviews.length > 0
						? { values: ga4.pageviews, ariaLabel: t('ga4PageviewsSparkline') }
						: undefined
				}
			/>
			<KpiCard
				label={t('radarRank')}
				icon={<Radar size={14} />}
				value={radarKpi.rank === null ? '—' : `#${radarKpi.rank.toLocaleString()}`}
				hint={radarKpi.rank === null ? t('radarEmpty') : t('radarHint')}
				loading={radarDomains.isLoading || radarHistoryForFirst.isLoading}
				sparkline={
					radarKpi.sparkline.length > 0
						? { values: radarKpi.sparkline, ariaLabel: t('radarSparkline') }
						: undefined
				}
			/>
			<KpiCard
				label={t('aiMentions')}
				icon={<Sparkles size={14} />}
				value={brandPrompts.isFetching && !brandPrompts.data ? '…' : aiPromptsCount.toString()}
				hint={t('aiHint')}
				loading={brandPrompts.isLoading}
				onClick={() => goTo('/projects/$id/brand-prompts')}
			/>
		</section>
	);
};
