import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	EmptyState,
	KpiCard,
	Sparkline,
	Spinner,
} from '@rankpulse/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	ChevronRight,
	Compass,
	Gauge,
	Layers,
	Map as MapIcon,
	MousePointerClick,
	Sparkles,
	Target,
	TrendingDown,
	TrendingUp,
	Users,
	Zap,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

/**
 * Issue #117 — Decision Cockpit landing.
 *
 * Sprint 1 widgets (live): SERP Map summary, Competitor Moat KPI, AI Brand
 * Radar deep-link, Daily Action Digest deep-link, Lost Opportunity Score,
 * Quick-Win ROI, CTR Anomaly Detector, Brand vs No-Brand decay.
 *
 * Remaining widgets in the epic (Page Experience scorecard, Search Demand
 * Trend, Forecast 90d, Competitor Activity Radar, Cannibalization,
 * Content Gap Map) are listed below as sub-issue trackers and will replace
 * the placeholders as they land.
 */
export const CockpitPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/cockpit' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const serpMapQuery = useQuery({
		queryKey: ['project', projectId, 'serp-map'],
		queryFn: () => api.rankTracking.serpMap(projectId),
	});
	const suggestionsQuery = useQuery({
		queryKey: ['project', projectId, 'serp-map-suggestions'],
		queryFn: () => api.rankTracking.serpCompetitorSuggestions(projectId, { minDistinctKeywords: 2 }),
	});
	const lostOpportunityQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'lost-opportunity'],
		queryFn: () => api.cockpit.lostOpportunity(projectId, { limit: 10 }),
	});
	const quickWinQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'quick-win-roi'],
		queryFn: () => api.cockpit.quickWinRoi(projectId, { limit: 10 }),
	});
	const ctrAnomaliesQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'ctr-anomalies'],
		queryFn: () => api.cockpit.ctrAnomalies(projectId),
	});
	const brandDecayQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'brand-decay'],
		queryFn: () => api.cockpit.brandDecay(projectId),
	});
	const aiSovDailyQuery = useQuery({
		queryKey: ['project', projectId, 'ai-search', 'sov-daily'],
		queryFn: () => api.aiSearch.projectSovDaily(projectId),
	});
	const competitorActivityQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'competitor-activity'],
		queryFn: () => api.cockpit.competitorActivity(projectId),
	});
	const pagesListQuery = useQuery({
		queryKey: ['project', projectId, 'page-speed', 'pages'],
		queryFn: () => api.pageSpeed.listForProject(projectId),
	});
	const contentGapCompetitorsQuery = useQuery({
		queryKey: ['project', projectId, 'competitors'],
		queryFn: () => api.projects.listCompetitors(projectId),
	});
	const searchDemandQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'search-demand-trend'],
		queryFn: () => api.cockpit.searchDemandTrend(projectId, { months: 13 }),
	});
	const forecast90dQuery = useQuery({
		queryKey: ['project', projectId, 'cockpit', 'forecast-90d'],
		queryFn: () => api.cockpit.forecast90d(projectId),
	});

	const cockpitMetrics = useMemo(() => {
		const rows = serpMapQuery.data?.rows ?? [];
		let ownInTop10 = 0;
		let ownInTop3 = 0;
		let competitorMoatLosses = 0;
		const trackedKeywords = new Set<string>();
		for (const row of rows) {
			trackedKeywords.add(row.phrase);
			const ownTop = row.results
				.filter((r) => r.classification === 'own')
				.reduce<number | null>((min, r) => (min === null || r.rank < min ? r.rank : min), null);
			const compTop = row.results
				.filter((r) => r.classification === 'competitor')
				.reduce<number | null>((min, r) => (min === null || r.rank < min ? r.rank : min), null);
			if (ownTop !== null && ownTop <= 10) ownInTop10 += 1;
			if (ownTop !== null && ownTop <= 3) ownInTop3 += 1;
			if (compTop !== null && (ownTop === null || compTop < ownTop)) competitorMoatLosses += 1;
		}
		return { tracked: trackedKeywords.size, ownInTop10, ownInTop3, competitorMoatLosses };
	}, [serpMapQuery.data]);

	const trackedPages = pagesListQuery.data ?? [];
	const pageSpeedHistoryQueries = useQueries({
		queries: trackedPages.map((page) => ({
			queryKey: ['page-speed', 'history', page.id, 'cockpit-7d'],
			queryFn: () =>
				api.pageSpeed.history(page.id, {
					from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
					to: new Date().toISOString(),
				}),
			staleTime: 5 * 60 * 1000,
		})),
	});

	const contentGapCompetitors = contentGapCompetitorsQuery.data ?? [];
	const contentGapDefaultCompetitor = contentGapCompetitors[0]?.domain ?? null;
	const contentGapDefaultOurDomain = projectQuery.data?.primaryDomain ?? null;
	const contentGapQuery = useQuery({
		queryKey: [
			'project',
			projectId,
			'cockpit',
			'content-gap',
			contentGapDefaultOurDomain,
			contentGapDefaultCompetitor,
		],
		queryFn: () =>
			api.competitorIntelligence.getKeywordGaps(projectId, {
				ourDomain: contentGapDefaultOurDomain ?? '',
				competitorDomain: contentGapDefaultCompetitor ?? '',
				limit: 10,
			}),
		enabled: Boolean(contentGapDefaultOurDomain) && Boolean(contentGapDefaultCompetitor),
	});

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
	const suggestions = suggestionsQuery.data?.suggestions ?? [];
	const serpRows = serpMapQuery.data?.rows ?? [];
	const lostOpportunity = lostOpportunityQuery.data;
	const quickWins = quickWinQuery.data;
	const ctrAnomalies = ctrAnomaliesQuery.data;
	const brandDecay = brandDecayQuery.data;

	const totalLostClicks = lostOpportunity?.totalLostClicks ?? 0;
	const ctrAnomalyCount = ctrAnomalies?.anomalies.length ?? 0;
	const noBrandDelta = brandDecay?.nonBranded.deltaPct ?? null;
	const sovDailyPoints = aiSovDailyQuery.data?.items ?? [];
	const sovValues = sovDailyPoints.map((p) => p.mentionRate * 100);
	const latestSovPct = sovValues.length === 0 ? null : (sovValues[sovValues.length - 1] ?? null);
	const competitorActivity = competitorActivityQuery.data;

	const latestPageScores = pageSpeedHistoryQueries
		.map((q) => {
			const snapshots = q.data ?? [];
			const last = snapshots.length === 0 ? null : (snapshots[snapshots.length - 1] ?? null);
			return last?.performanceScore ?? null;
		})
		.filter((v): v is number => v !== null);
	const pageExperienceAvg =
		latestPageScores.length === 0
			? null
			: latestPageScores.reduce((acc, s) => acc + s, 0) / latestPageScores.length;
	const pagesWithIssues = latestPageScores.filter((s) => s < 0.5).length;

	const contentGapData = contentGapQuery.data;
	const searchDemand = searchDemandQuery.data;
	const searchDemandDeltaPct = searchDemand?.deltaPct ?? null;
	const forecast = forecast90dQuery.data;
	const forecastDeltaPct = forecast?.deltaPct ?? null;
	const forecastObservedSpark = (forecast?.points ?? [])
		.filter((p) => p.type === 'observed')
		.map((p) => p.clicks);
	const forecastSpark = (forecast?.points ?? []).filter((p) => p.type === 'forecast').map((p) => p.clicks);

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<Link
							to="/projects/$id"
							params={{ id: projectId }}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<ArrowLeft size={12} />
							{t('cockpit:backToProject')}
						</Link>
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Compass size={20} className="text-primary" />
							{t('cockpit:title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{project?.name} · {t('cockpit:subtitle')}
						</p>
					</div>
				</header>

				{brandDecay?.alert ? (
					<Card>
						<CardContent className="flex items-start gap-3 py-3">
							<AlertTriangle size={20} className="shrink-0 text-destructive" />
							<div className="flex-1 text-sm">
								<p className="font-semibold">{t('cockpit:brandDecay.alertTitle')}</p>
								<p className="text-muted-foreground">
									{t('cockpit:brandDecay.alertBody', {
										pct: noBrandDelta?.toFixed(1) ?? '0',
										thisWeek: brandDecay.nonBranded.clicksThisWeek,
										lastWeek: brandDecay.nonBranded.clicksLastWeek,
									})}
								</p>
							</div>
						</CardContent>
					</Card>
				) : null}

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<KpiCard
						label={t('cockpit:kpi.tracked')}
						value={cockpitMetrics.tracked.toString()}
						hint={t('cockpit:kpi.trackedHint')}
					/>
					<KpiCard
						label={t('cockpit:kpi.lostClicks')}
						value={formatNumber(totalLostClicks)}
						hint={t('cockpit:kpi.lostClicksHint')}
					/>
					<KpiCard
						label={t('cockpit:kpi.ctrAnomalies')}
						value={ctrAnomalyCount.toString()}
						hint={t('cockpit:kpi.ctrAnomaliesHint')}
					/>
					<KpiCard
						label={t('cockpit:kpi.behindCompetitor')}
						value={cockpitMetrics.competitorMoatLosses.toString()}
						hint={t('cockpit:kpi.behindCompetitorHint')}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<WidgetCard
						title={t('cockpit:widgets.lostOpportunity.title')}
						hint={t('cockpit:widgets.lostOpportunity.hint')}
						icon={<TrendingDown size={14} className="text-rose-600" />}
						href={{ to: '/projects/$id/lost-opportunity', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{lostOpportunityQuery.isLoading ? (
							<Spinner size="sm" />
						) : !lostOpportunity || lostOpportunity.rows.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.lostOpportunity.empty')}
								description={t('cockpit:widgets.lostOpportunity.emptyDescription')}
							/>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{lostOpportunity.rows.slice(0, 5).map((row) => (
									<li
										key={`${row.query}-${row.page ?? ''}`}
										className="flex items-center justify-between gap-2"
									>
										<span className="min-w-0 break-words">
											<span className="font-medium">{row.query}</span>{' '}
											<span className="text-xs text-muted-foreground">#{row.currentPosition.toFixed(1)}</span>
										</span>
										<span className="font-mono text-xs text-rose-600">+{formatNumber(row.lostClicks)}</span>
									</li>
								))}
							</ul>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.quickWinRoi.title')}
						hint={t('cockpit:widgets.quickWinRoi.hint')}
						icon={<Zap size={14} className="text-amber-600" />}
						href={{ to: '/projects/$id/opportunities', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{quickWinQuery.isLoading ? (
							<Spinner size="sm" />
						) : !quickWins || quickWins.rows.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.quickWinRoi.empty')}
								description={t('cockpit:widgets.quickWinRoi.emptyDescription')}
							/>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{quickWins.rows.slice(0, 5).map((row) => (
									<li
										key={`${row.query}-${row.page ?? ''}`}
										className="flex items-center justify-between gap-2"
									>
										<span className="min-w-0 break-words">
											<span className="font-medium">{row.query}</span>{' '}
											<span className="text-xs text-muted-foreground">#{row.currentPosition.toFixed(1)}</span>
										</span>
										<span className="font-mono text-xs text-amber-700">
											+{formatNumber(row.projectedClickGain)}
										</span>
									</li>
								))}
							</ul>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.ctrAnomaly.title')}
						hint={t('cockpit:widgets.ctrAnomaly.hint')}
						icon={<MousePointerClick size={14} className="text-rose-600" />}
						href={{ to: '/projects/$id/ctr-anomalies', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{ctrAnomaliesQuery.isLoading ? (
							<Spinner size="sm" />
						) : !ctrAnomalies || ctrAnomalies.anomalies.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.ctrAnomaly.empty')}
								description={t('cockpit:widgets.ctrAnomaly.emptyDescription')}
							/>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{ctrAnomalies.anomalies.slice(0, 5).map((row) => (
									<li key={row.query} className="flex items-center justify-between gap-2">
										<span className="min-w-0 break-words">
											<span className="font-medium">{row.query}</span>{' '}
											<span className="text-xs text-muted-foreground">#{row.avgPosition.toFixed(1)}</span>
										</span>
										<span className="font-mono text-xs text-rose-600">
											{formatNumber(row.impressions)} impr · 0 clicks
										</span>
									</li>
								))}
							</ul>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.brandDecay.title')}
						hint={t('cockpit:widgets.brandDecay.hint')}
						icon={<TrendingDown size={14} className="text-purple-600" />}
						href={{ to: '/projects/$id/scorecard', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{brandDecayQuery.isLoading ? (
							<Spinner size="sm" />
						) : !brandDecay ? (
							<EmptyState
								title={t('cockpit:widgets.brandDecay.empty')}
								description={t('cockpit:widgets.brandDecay.emptyDescription')}
							/>
						) : (
							<div className="grid grid-cols-2 gap-2 text-sm">
								<BrandDecayBucket
									label={t('cockpit:widgets.brandDecay.branded')}
									thisWeek={brandDecay.branded.clicksThisWeek}
									lastWeek={brandDecay.branded.clicksLastWeek}
									deltaPct={brandDecay.branded.deltaPct}
								/>
								<BrandDecayBucket
									label={t('cockpit:widgets.brandDecay.nonBranded')}
									thisWeek={brandDecay.nonBranded.clicksThisWeek}
									lastWeek={brandDecay.nonBranded.clicksLastWeek}
									deltaPct={brandDecay.nonBranded.deltaPct}
									warn={brandDecay.alert}
								/>
							</div>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.dailyActions.title')}
						hint={t('cockpit:widgets.dailyActions.hint')}
						icon={<CheckCircle2 size={14} className="text-emerald-600" />}
						href={{ to: '/projects/$id/actions', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						<p className="text-sm text-muted-foreground">{t('cockpit:widgets.dailyActions.description')}</p>
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.serpMap.title')}
						hint={t('cockpit:widgets.serpMap.hint')}
						icon={<MapIcon size={14} className="text-primary" />}
						href={{ to: '/projects/$id/serp-map', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{serpRows.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.serpMap.empty')}
								description={t('cockpit:widgets.serpMap.emptyDescription')}
							/>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{serpRows.slice(0, 5).map((row) => {
									const ownRank = row.results.find((r) => r.classification === 'own');
									return (
										<li
											key={`${row.phrase}-${row.country}`}
											className="flex items-center justify-between gap-2"
										>
											<span className="break-words">
												<span className="font-medium">{row.phrase}</span>{' '}
												<span className="text-xs text-muted-foreground">
													{row.country} · {row.device}
												</span>
											</span>
											<span className="font-mono text-xs">
												{ownRank ? `#${ownRank.rank}` : t('cockpit:notRanked')}
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.competitorMoat.title')}
						hint={t('cockpit:widgets.competitorMoat.hint')}
						icon={<Users size={14} className="text-amber-600" />}
						href={{ to: '/projects/$id/competitors', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						<p className="text-sm text-muted-foreground">
							{t('cockpit:widgets.competitorMoat.description', {
								losses: cockpitMetrics.competitorMoatLosses,
							})}
						</p>
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.aiRadar.title')}
						hint={t('cockpit:widgets.aiRadar.hint')}
						icon={<Sparkles size={14} className="text-purple-600" />}
						href={{ to: '/projects/$id/ai-radar', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{aiSovDailyQuery.isLoading ? (
							<Spinner size="sm" />
						) : sovValues.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.aiRadar.empty')}
								description={t('cockpit:widgets.aiRadar.emptyDescription')}
							/>
						) : (
							<div className="flex flex-col gap-2">
								<div className="flex items-baseline justify-between gap-2">
									<span className="font-mono text-2xl font-semibold">
										{latestSovPct === null ? '—' : `${latestSovPct.toFixed(0)}%`}
									</span>
									<span className="text-xs text-muted-foreground">
										{t('cockpit:widgets.aiRadar.windowHint', { days: sovValues.length })}
									</span>
								</div>
								<Sparkline
									values={sovValues}
									stroke="#a855f7"
									fill="#a855f7"
									aria-label={t('cockpit:widgets.aiRadar.sparklineAria')}
								/>
								<p className="text-xs text-muted-foreground">{t('cockpit:widgets.aiRadar.description')}</p>
							</div>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.cannibalization.title')}
						hint={t('cockpit:widgets.cannibalization.hint')}
						icon={<Layers size={14} className="text-cyan-600" />}
						href={{ to: '/projects/$id/cannibalization', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						<p className="text-sm text-muted-foreground">
							{t('cockpit:widgets.cannibalization.description')}
						</p>
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.competitorActivity.title')}
						hint={t('cockpit:widgets.competitorActivity.hint')}
						icon={<Activity size={14} className="text-amber-600" />}
						href={{ to: '/projects/$id/competitor-activity', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{competitorActivityQuery.isLoading ? (
							<Spinner size="sm" />
						) : !competitorActivity || competitorActivity.rows.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.competitorActivity.empty')}
								description={t('cockpit:widgets.competitorActivity.emptyDescription')}
							/>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{competitorActivity.rows.slice(0, 5).map((row) => (
									<li key={row.competitorId} className="flex items-center justify-between gap-2">
										<span className="min-w-0 break-words">
											<span className="font-medium">{row.label}</span>
										</span>
										<div className="flex items-center gap-2">
											<div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/40">
												<div className="h-full bg-amber-500" style={{ width: `${row.activityScore}%` }} />
											</div>
											<span className="font-mono text-xs">{row.activityScore}</span>
										</div>
									</li>
								))}
							</ul>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.pageExperience.title')}
						hint={t('cockpit:widgets.pageExperience.hint')}
						icon={<Gauge size={14} className="text-emerald-600" />}
						href={{ to: '/projects/$id/page-experience', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{pagesListQuery.isLoading ? (
							<Spinner size="sm" />
						) : trackedPages.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.pageExperience.empty')}
								description={t('cockpit:widgets.pageExperience.emptyDescription')}
							/>
						) : (
							<div className="flex flex-col gap-2 text-sm">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-2xl font-semibold">
										{pageExperienceAvg === null ? '—' : Math.round(pageExperienceAvg * 100)}
									</span>
									<span className="text-xs text-muted-foreground">
										{t('cockpit:widgets.pageExperience.avgScore')}
									</span>
								</div>
								<p className="text-xs text-muted-foreground">
									{t('cockpit:widgets.pageExperience.summary', {
										total: trackedPages.length,
										issues: pagesWithIssues,
									})}
								</p>
							</div>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.contentGap.title')}
						hint={t('cockpit:widgets.contentGap.hint')}
						icon={<MapIcon size={14} className="text-cyan-600" />}
						href={{ to: '/projects/$id/content-gap', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{contentGapCompetitorsQuery.isLoading || contentGapQuery.isLoading ? (
							<Spinner size="sm" />
						) : contentGapCompetitors.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.contentGap.emptyNoCompetitors')}
								description={t('cockpit:widgets.contentGap.emptyNoCompetitorsDescription')}
							/>
						) : !contentGapData || contentGapData.rows.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.contentGap.empty')}
								description={t('cockpit:widgets.contentGap.emptyDescription')}
							/>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{contentGapData.rows.slice(0, 5).map((row) => (
									<li key={row.keyword} className="flex items-center justify-between gap-2">
										<span className="min-w-0 break-words font-medium">{row.keyword}</span>
										<span className="font-mono text-xs text-muted-foreground">
											{row.searchVolume === null ? '—' : `${row.searchVolume}`}
										</span>
									</li>
								))}
							</ul>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.searchDemandTrend.title')}
						hint={t('cockpit:widgets.searchDemandTrend.hint')}
						icon={
							searchDemandDeltaPct !== null && searchDemandDeltaPct < 0 ? (
								<TrendingDown size={14} className="text-red-600" />
							) : (
								<TrendingUp size={14} className="text-emerald-600" />
							)
						}
						href={{ to: '/projects/$id/search-demand-trend', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{searchDemandQuery.isLoading ? (
							<Spinner size="sm" />
						) : !searchDemand || searchDemand.points.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.searchDemandTrend.empty')}
								description={t('cockpit:widgets.searchDemandTrend.emptyDescription')}
							/>
						) : (
							<div className="flex flex-col gap-2">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-2xl font-semibold">
										{searchDemand.latestVolume >= 1_000_000
											? `${(searchDemand.latestVolume / 1_000_000).toFixed(1)}M`
											: searchDemand.latestVolume >= 1_000
												? `${(searchDemand.latestVolume / 1_000).toFixed(1)}k`
												: searchDemand.latestVolume.toString()}
									</span>
									{searchDemandDeltaPct !== null ? (
										<span
											className={`font-mono text-xs ${searchDemandDeltaPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
										>
											{searchDemandDeltaPct > 0 ? '+' : ''}
											{searchDemandDeltaPct}%
										</span>
									) : null}
								</div>
								<Sparkline
									values={searchDemand.points.map((p) => p.totalVolume)}
									height={32}
									stroke={
										searchDemandDeltaPct !== null && searchDemandDeltaPct < 0
											? 'rgb(220, 38, 38)'
											: 'rgb(5, 150, 105)'
									}
									className="text-primary"
								/>
							</div>
						)}
					</WidgetCard>

					<WidgetCard
						title={t('cockpit:widgets.forecast90d.title')}
						hint={t('cockpit:widgets.forecast90d.hint')}
						icon={
							forecastDeltaPct !== null && forecastDeltaPct < 0 ? (
								<TrendingDown size={14} className="text-red-600" />
							) : (
								<TrendingUp size={14} className="text-emerald-600" />
							)
						}
						href={{ to: '/projects/$id/forecast-90d', params: { id: projectId } }}
						cta={t('cockpit:openDetail')}
					>
						{forecast90dQuery.isLoading ? (
							<Spinner size="sm" />
						) : !forecast || forecast.points.length === 0 ? (
							<EmptyState
								title={t('cockpit:widgets.forecast90d.empty')}
								description={t('cockpit:widgets.forecast90d.emptyDescription')}
							/>
						) : (
							<div className="flex flex-col gap-2">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-2xl font-semibold">
										{forecastDeltaPct === null
											? '—'
											: `${forecastDeltaPct > 0 ? '+' : ''}${forecastDeltaPct}%`}
									</span>
									<span className="text-xs text-muted-foreground">
										{t('cockpit:widgets.forecast90d.vsHistory')}
									</span>
								</div>
								<div className="grid grid-cols-2 gap-2">
									<div>
										<p className="text-[10px] uppercase text-muted-foreground">
											{t('cockpit:widgets.forecast90d.observed')}
										</p>
										<Sparkline values={forecastObservedSpark} height={28} stroke="rgb(99, 102, 241)" />
									</div>
									<div>
										<p className="text-[10px] uppercase text-muted-foreground">
											{t('cockpit:widgets.forecast90d.forecast')}
										</p>
										<Sparkline
											values={forecastSpark}
											height={28}
											stroke={
												forecastDeltaPct !== null && forecastDeltaPct < 0
													? 'rgb(220, 38, 38)'
													: 'rgb(5, 150, 105)'
											}
										/>
									</div>
								</div>
							</div>
						)}
					</WidgetCard>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Target size={14} />
							{t('cockpit:suggestions.title')}
						</CardTitle>
						<p className="text-xs text-muted-foreground">{t('cockpit:suggestions.hint')}</p>
					</CardHeader>
					<CardContent>
						{suggestions.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t('cockpit:suggestions.empty')}</p>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{suggestions.slice(0, 5).map((s) => (
									<li key={s.domain} className="flex items-center justify-between gap-2">
										<span className="break-all font-medium">{s.domain}</span>
										<span className="font-mono text-xs text-muted-foreground">
											{t('cockpit:suggestions.kwHits', { kw: s.distinctKeywords })}
										</span>
									</li>
								))}
							</ul>
						)}
						<div className="mt-3">
							<Link to="/projects/$id/serp-map" params={{ id: projectId }}>
								<Button size="sm" variant="secondary">
									{t('cockpit:openDetail')}
									<ChevronRight size={14} />
								</Button>
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
};

interface WidgetCardProps {
	title: string;
	hint: string;
	icon: ReactNode;
	href: { to: string; params: Record<string, string> };
	cta: string;
	children: ReactNode;
}

const WidgetCard = ({ title, hint, icon, href, cta, children }: WidgetCardProps) => (
	<Card>
		<CardHeader className="flex flex-row items-start justify-between gap-2">
			<div>
				<CardTitle className="flex items-center gap-2 text-base">
					{icon}
					{title}
				</CardTitle>
				<p className="text-xs text-muted-foreground">{hint}</p>
			</div>
			<Link to={href.to} params={href.params}>
				<Button size="sm" variant="ghost" type="button">
					{cta}
					<ChevronRight size={14} />
				</Button>
			</Link>
		</CardHeader>
		<CardContent>{children}</CardContent>
	</Card>
);

const BrandDecayBucket = ({
	label,
	thisWeek,
	lastWeek,
	deltaPct,
	warn,
}: {
	label: string;
	thisWeek: number;
	lastWeek: number;
	deltaPct: number | null;
	warn?: boolean;
}) => {
	const deltaText = deltaPct === null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
	const deltaColor =
		deltaPct === null
			? 'text-muted-foreground'
			: deltaPct >= 0
				? 'text-emerald-600'
				: warn
					? 'text-destructive'
					: 'text-amber-600';
	return (
		<div className="rounded border border-border p-2">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="font-mono text-sm font-semibold">{formatNumber(thisWeek)}</p>
			<p className={`text-xs ${deltaColor}`}>
				{deltaText} <span className="text-muted-foreground">vs {formatNumber(lastWeek)}</span>
			</p>
		</div>
	);
};

const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
};
