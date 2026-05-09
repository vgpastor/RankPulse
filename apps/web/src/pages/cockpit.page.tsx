import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	EmptyState,
	KpiCard,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowLeft,
	ArrowUpRight,
	BarChart3,
	CheckCircle2,
	ChevronRight,
	Compass,
	Map as MapIcon,
	Sparkles,
	Target,
	TrendingDown,
	TrendingUp,
	Users,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

/**
 * Issue #117 — Decision Cockpit landing.
 *
 * MVP scaffold composing the widgets that already have read-models behind
 * them (SERP Map, Competitor Moat, AI Brand Radar SoV, daily actions).
 * The remaining 7 widgets in the epic (Lost Opportunity, Quick-Win ROI,
 * CTR Anomaly Detector, Brand-vs-No-Brand decay, Page Experience scorecard,
 * Search Demand Trend, Forecast 90d) are tracked as sub-issues and surfaced
 * here as "soon" placeholders so the cockpit is the canonical landing page
 * the operator opens each morning.
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
		return {
			tracked: trackedKeywords.size,
			ownInTop10,
			ownInTop3,
			competitorMoatLosses,
		};
	}, [serpMapQuery.data]);

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

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<KpiCard
						label={t('cockpit:kpi.tracked')}
						value={cockpitMetrics.tracked.toString()}
						hint={t('cockpit:kpi.trackedHint')}
					/>
					<KpiCard
						label={t('cockpit:kpi.top10')}
						value={cockpitMetrics.ownInTop10.toString()}
						hint={t('cockpit:kpi.top10Hint', { total: cockpitMetrics.tracked })}
					/>
					<KpiCard
						label={t('cockpit:kpi.top3')}
						value={cockpitMetrics.ownInTop3.toString()}
						hint={t('cockpit:kpi.top3Hint', { total: cockpitMetrics.tracked })}
					/>
					<KpiCard
						label={t('cockpit:kpi.behindCompetitor')}
						value={cockpitMetrics.competitorMoatLosses.toString()}
						hint={t('cockpit:kpi.behindCompetitorHint')}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
						<p className="text-sm text-muted-foreground">{t('cockpit:widgets.aiRadar.description')}</p>
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

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<BarChart3 size={14} />
							{t('cockpit:upcoming.title')}
						</CardTitle>
						<p className="text-xs text-muted-foreground">{t('cockpit:upcoming.hint')}</p>
					</CardHeader>
					<CardContent>
						<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{[
								{ icon: <TrendingDown size={14} />, label: t('cockpit:upcoming.items.lostOpportunity') },
								{ icon: <TrendingUp size={14} />, label: t('cockpit:upcoming.items.quickWinRoi') },
								{ icon: <ArrowUpRight size={14} />, label: t('cockpit:upcoming.items.ctrAnomaly') },
								{ icon: <BarChart3 size={14} />, label: t('cockpit:upcoming.items.brandDecay') },
								{ icon: <Compass size={14} />, label: t('cockpit:upcoming.items.pageExperience') },
								{ icon: <TrendingUp size={14} />, label: t('cockpit:upcoming.items.forecast90d') },
							].map((item) => (
								<li
									key={item.label}
									className="flex items-center gap-2 rounded border border-dashed border-border p-2 text-sm"
								>
									<span className="text-muted-foreground">{item.icon}</span>
									<span>{item.label}</span>
									<Badge variant="secondary" className="ml-auto">
										{t('cockpit:upcoming.soonBadge')}
									</Badge>
								</li>
							))}
						</ul>
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
