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
import { ArrowLeft, ArrowRight, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

interface WindowMetrics {
	visibilityScore: number;
	sessions: number;
	conversions: number;
	sovPct: number;
	rankedKeywords: number;
}

interface DeltaMetric {
	current: number;
	previous: number;
	delta: number;
	deltaPct: number;
}

const computeDelta = (current: number, previous: number): DeltaMetric => {
	const delta = current - previous;
	const deltaPct = previous === 0 ? (current > 0 ? 1 : 0) : delta / previous;
	return { current, previous, delta, deltaPct };
};

const formatPct = (value: number): string => {
	const sign = value > 0 ? '+' : '';
	return `${sign}${(value * 100).toFixed(1)}%`;
};

const formatCount = (value: number): string => Math.round(value).toLocaleString();

const trendOf = (delta: number): 'up' | 'down' | 'flat' => {
	if (delta > 0) return 'up';
	if (delta < 0) return 'down';
	return 'flat';
};

interface ChangeNarrative {
	emoji: string;
	text: string;
	link?: { to: string; params: Record<string, string> };
}

export const WeeklyScorecardPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/scorecard' });
	const { t } = useTranslation('scorecard');
	const [range, setRange] = useState<RangePreset>('7d');
	const windowDays = RANGE_DAYS[range];

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});
	const ga4Properties = useQuery({
		queryKey: ['project', projectId, 'ga4'],
		queryFn: () => api.ga4.listForProject(projectId),
	});

	const firstGa4Id = ga4Properties.data?.[0]?.id ?? null;
	const ga4Metrics = useQuery({
		queryKey: ['project', projectId, 'ga4', 'metrics-scorecard', windowDays, firstGa4Id],
		queryFn: () =>
			api.ga4.metrics(firstGa4Id ?? '', {
				from: isoDayShift(windowDays * 2),
				to: isoDay(new Date()),
			}),
		enabled: firstGa4Id !== null,
	});

	const competitorsQuery = useQuery({
		queryKey: ['project', projectId, 'competitors'],
		queryFn: () => api.projects.listCompetitors(projectId),
	});

	const ownDomains = useMemo(
		() => new Set(projectQuery.data?.domains.map((d) => d.domain) ?? []),
		[projectQuery.data],
	);

	const competitorDomains = useMemo(
		() => new Set(competitorsQuery.data?.map((c) => c.domain) ?? []),
		[competitorsQuery.data],
	);

	const buildSnapshotForOffset = (offsetDays: number): WindowMetrics => {
		const upper = isoDayShift(offsetDays);
		const lower = isoDayShift(offsetDays + windowDays);
		const rankings = rankingsQuery.data ?? [];
		const inWindow = rankings.filter((r) => r.observedAt >= lower && r.observedAt < upper);
		const ga4Rows = (ga4Metrics.data ?? []).filter((r) => {
			const day = r.observedDate.slice(0, 10);
			return day >= lower && day < upper;
		});

		const ownInWindow = inWindow.filter((r) => ownDomains.has(r.domain) && r.position !== null);
		const visibilityScore = ownInWindow.reduce(
			(acc, r) => acc + (r.position === null ? 0 : 1 / r.position),
			0,
		);

		const sessions = ga4Rows
			.filter((r) => (r.dimensions.sessionMedium ?? '') === 'organic' || !r.dimensions.sessionMedium)
			.reduce((acc, r) => acc + (r.metrics.sessions ?? 0), 0);

		const conversions = ga4Rows.reduce((acc, r) => acc + (r.metrics.conversions ?? 0), 0);

		const top10Map = new Map<string, { ours: number; competitors: number }>();
		for (const r of inWindow) {
			if (r.position === null || r.position > 10) continue;
			const cur = top10Map.get(r.phrase) ?? { ours: 0, competitors: 0 };
			if (ownDomains.has(r.domain)) cur.ours += 1;
			else if (competitorDomains.has(r.domain)) cur.competitors += 1;
			top10Map.set(r.phrase, cur);
		}
		const sovTotals = [...top10Map.values()].reduce(
			(acc, v) => ({ ours: acc.ours + v.ours, total: acc.total + v.ours + v.competitors }),
			{ ours: 0, total: 0 },
		);
		const sovPct = sovTotals.total === 0 ? 0 : (sovTotals.ours / sovTotals.total) * 100;

		const rankedKeywords = new Set(ownInWindow.map((r) => r.phrase)).size;

		return { visibilityScore, sessions, conversions, sovPct, rankedKeywords };
	};

	const current = useMemo(
		() => buildSnapshotForOffset(0),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[rankingsQuery.data, ga4Metrics.data, ownDomains, competitorDomains, windowDays],
	);
	const previous = useMemo(
		() => buildSnapshotForOffset(windowDays),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[rankingsQuery.data, ga4Metrics.data, ownDomains, competitorDomains, windowDays],
	);

	const visibilityDelta = computeDelta(current.visibilityScore, previous.visibilityScore);
	const sessionsDelta = computeDelta(current.sessions, previous.sessions);
	const conversionsDelta = computeDelta(current.conversions, previous.conversions);
	const sovDelta = computeDelta(current.sovPct, previous.sovPct);

	const verdictScore =
		visibilityDelta.deltaPct * 0.2 + sessionsDelta.deltaPct * 0.3 + conversionsDelta.deltaPct * 0.5;
	const verdict = verdictScore > 0.05 ? 'winning' : verdictScore < -0.05 ? 'losing' : 'flat';

	const changes = useMemo<ChangeNarrative[]>(() => {
		const out: ChangeNarrative[] = [];
		const rankings = rankingsQuery.data ?? [];
		const groupedByKeyword = new Map<
			string,
			{
				phrase: string;
				current: number | null;
				prev: number | null;
				domain: string;
				trackedKeywordId: string;
			}
		>();
		const upperA = isoDayShift(0);
		const lowerA = isoDayShift(windowDays);
		const upperB = lowerA;
		const lowerB = isoDayShift(windowDays * 2);
		for (const r of rankings) {
			if (!ownDomains.has(r.domain) || r.position === null) continue;
			const cur = groupedByKeyword.get(r.phrase) ?? {
				phrase: r.phrase,
				current: null,
				prev: null,
				domain: r.domain,
				trackedKeywordId: r.trackedKeywordId,
			};
			if (r.observedAt >= lowerA && r.observedAt < upperA) {
				if (cur.current === null || r.position < cur.current) cur.current = r.position;
			} else if (r.observedAt >= lowerB && r.observedAt < upperB) {
				if (cur.prev === null || r.position < cur.prev) cur.prev = r.position;
			}
			groupedByKeyword.set(r.phrase, cur);
		}
		const movements = [...groupedByKeyword.values()]
			.filter((k) => k.current !== null && k.prev !== null && k.current !== k.prev)
			.map((k) => ({ ...k, delta: (k.prev ?? 0) - (k.current ?? 0) }))
			.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
			.slice(0, 5);
		for (const m of movements) {
			if (m.delta > 0) {
				out.push({
					emoji: '📈',
					text: t('changes.improved', {
						phrase: m.phrase,
						from: m.prev,
						to: m.current,
					}),
				});
			} else {
				out.push({
					emoji: '📉',
					text: t('changes.dropped', {
						phrase: m.phrase,
						from: m.prev,
						to: m.current,
					}),
				});
			}
		}
		if (sessionsDelta.delta !== 0) {
			out.push({
				emoji: sessionsDelta.delta > 0 ? '🚀' : '⚠️',
				text: t('changes.organicTraffic', {
					sign: sessionsDelta.delta > 0 ? '+' : '',
					pct: (sessionsDelta.deltaPct * 100).toFixed(1),
				}),
			});
		}
		if (conversionsDelta.delta !== 0) {
			out.push({
				emoji: conversionsDelta.delta > 0 ? '🎯' : '🔻',
				text: t('changes.conversions', {
					sign: conversionsDelta.delta > 0 ? '+' : '',
					pct: (conversionsDelta.deltaPct * 100).toFixed(1),
				}),
			});
		}
		return out;
	}, [rankingsQuery.data, ownDomains, sessionsDelta, conversionsDelta, windowDays, t]);

	if (projectQuery.isLoading || rankingsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const verdictBadgeVariant =
		verdict === 'winning' ? 'success' : verdict === 'losing' ? 'destructive' : 'secondary';

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
							{t('back')}
						</Link>
						<h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Trophy size={20} className="text-primary" />
							{t('title')}
						</h1>
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

				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-8">
						<Badge variant={verdictBadgeVariant} className="text-base uppercase tracking-wider">
							{t(`verdict.${verdict}`)}
						</Badge>
						<p className="text-center text-sm text-muted-foreground">
							{t(`verdictHint.${verdict}`, { pct: (verdictScore * 100).toFixed(1) })}
						</p>
					</CardContent>
				</Card>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<KpiCard
						label={t('kpi.visibility')}
						icon={<TrendingUp size={14} />}
						value={current.visibilityScore.toFixed(2)}
						hint={t('kpi.visibilityHint', { keywords: current.rankedKeywords })}
						delta={
							previous.visibilityScore > 0
								? { value: formatPct(visibilityDelta.deltaPct), trend: trendOf(visibilityDelta.delta) }
								: undefined
						}
					/>
					<KpiCard
						label={t('kpi.organic')}
						icon={<Users size={14} />}
						value={formatCount(current.sessions)}
						hint={t('kpi.organicHint')}
						delta={
							previous.sessions > 0
								? { value: formatPct(sessionsDelta.deltaPct), trend: trendOf(sessionsDelta.delta) }
								: undefined
						}
					/>
					<KpiCard
						label={t('kpi.conversions')}
						icon={<Trophy size={14} />}
						value={formatCount(current.conversions)}
						hint={t('kpi.conversionsHint')}
						delta={
							previous.conversions > 0
								? { value: formatPct(conversionsDelta.deltaPct), trend: trendOf(conversionsDelta.delta) }
								: undefined
						}
					/>
					<KpiCard
						label={t('kpi.sov')}
						icon={<TrendingDown size={14} />}
						value={`${current.sovPct.toFixed(1)}%`}
						hint={t('kpi.sovHint')}
						delta={
							previous.sovPct > 0
								? { value: formatPct(sovDelta.deltaPct), trend: trendOf(sovDelta.delta) }
								: undefined
						}
					/>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('changes.title')}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('changes.hint')}</p>
					</CardHeader>
					<CardContent>
						{changes.length === 0 ? (
							<EmptyState title={t('changes.empty')} description={t('changes.emptyHint')} />
						) : (
							<ul className="flex flex-col gap-2 text-sm">
								{changes.map((c) => (
									<li key={`${c.emoji}-${c.text}`} className="flex items-start gap-2">
										<span aria-hidden>{c.emoji}</span>
										<span>{c.text}</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('drilldowns.title')}</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col gap-2 text-sm">
							<li className="flex items-center justify-between">
								<span>{t('drilldowns.rankings')}</span>
								<Link to="/projects/$id/rankings" params={{ id: projectId }}>
									<Button variant="ghost" size="sm">
										{t('common.open')}
										<ArrowRight size={14} />
									</Button>
								</Link>
							</li>
							<li className="flex items-center justify-between">
								<span>{t('drilldowns.competitors')}</span>
								<Link to="/projects/$id/competitors" params={{ id: projectId }}>
									<Button variant="ghost" size="sm">
										{t('common.open')}
										<ArrowRight size={14} />
									</Button>
								</Link>
							</li>
							<li className="flex items-center justify-between">
								<span>{t('drilldowns.aiRadar')}</span>
								<Link to="/projects/$id/ai-radar" params={{ id: projectId }}>
									<Button variant="ghost" size="sm">
										{t('common.open')}
										<ArrowRight size={14} />
									</Button>
								</Link>
							</li>
						</ul>
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
};
