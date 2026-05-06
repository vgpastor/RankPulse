import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
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
import { Link, useParams } from '@tanstack/react-router';
import { Globe2, MessageSquareQuote, Quote, Smile, Sparkles, ThumbsDown } from 'lucide-react';
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

type LlmAnswer = AiSearchInsightsContracts.LlmAnswerDtoSchema;

type RangePreset = '7d' | '28d' | '90d';

const RANGE_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90 };

const PROVIDERS = ['openai', 'anthropic', 'perplexity', 'google-ai-studio'] as const;
const PROVIDER_COLORS: Record<(typeof PROVIDERS)[number], string> = {
	openai: '#10a37f',
	anthropic: '#c47e34',
	perplexity: '#1c8aa3',
	'google-ai-studio': '#4285f4',
};

interface DailyMentions {
	day: string;
	openai: number;
	anthropic: number;
	perplexity: number;
	'google-ai-studio': number;
}

interface BrandSov {
	brand: string;
	answers: number;
	pct: number;
	avgPosition: number;
	isOwn: boolean;
}

interface CitedDomain {
	domain: string;
	citations: number;
	urls: Set<string>;
	isOwn: boolean;
}

const filterByRange = (answers: readonly LlmAnswer[], days: number): LlmAnswer[] => {
	const cutoff = new Date();
	cutoff.setUTCDate(cutoff.getUTCDate() - days);
	const cutoffIso = cutoff.toISOString();
	return answers.filter((a) => a.capturedAt >= cutoffIso);
};

const computeSov = (answers: readonly LlmAnswer[]): BrandSov[] => {
	const totalAnswers = answers.length;
	const buckets = new Map<
		string,
		{ answers: Set<string>; positionSum: number; count: number; isOwn: boolean }
	>();
	for (const answer of answers) {
		const seen = new Set<string>();
		for (const m of answer.mentions) {
			if (seen.has(m.brand)) continue;
			seen.add(m.brand);
			const cur = buckets.get(m.brand) ?? {
				answers: new Set<string>(),
				positionSum: 0,
				count: 0,
				isOwn: m.isOwnBrand,
			};
			cur.answers.add(answer.id);
			cur.positionSum += m.position;
			cur.count += 1;
			cur.isOwn = cur.isOwn || m.isOwnBrand;
			buckets.set(m.brand, cur);
		}
	}
	return [...buckets.entries()]
		.map(([brand, b]) => ({
			brand,
			answers: b.answers.size,
			pct: totalAnswers === 0 ? 0 : (b.answers.size / totalAnswers) * 100,
			avgPosition: b.count === 0 ? 0 : b.positionSum / b.count,
			isOwn: b.isOwn,
		}))
		.sort((a, b) => b.answers - a.answers);
};

const computeMentionsTimeline = (answers: readonly LlmAnswer[]): DailyMentions[] => {
	const buckets = new Map<string, DailyMentions>();
	for (const answer of answers) {
		const day = answer.capturedAt.slice(0, 10);
		const cur = buckets.get(day) ?? { day, openai: 0, anthropic: 0, perplexity: 0, 'google-ai-studio': 0 };
		const ownMention = answer.mentions.some((m) => m.isOwnBrand);
		if (ownMention) cur[answer.aiProvider] += 1;
		buckets.set(day, cur);
	}
	return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
};

const computeCitedDomains = (answers: readonly LlmAnswer[]): CitedDomain[] => {
	const buckets = new Map<string, CitedDomain>();
	for (const answer of answers) {
		for (const c of answer.citations) {
			const cur = buckets.get(c.domain) ?? {
				domain: c.domain,
				citations: 0,
				urls: new Set<string>(),
				isOwn: c.isOwnDomain,
			};
			cur.citations += 1;
			cur.urls.add(c.url);
			cur.isOwn = cur.isOwn || c.isOwnDomain;
			buckets.set(c.domain, cur);
		}
	}
	return [...buckets.values()].sort((a, b) => b.citations - a.citations);
};

const computeSentiment = (
	answers: readonly LlmAnswer[],
): { positive: number; neutral: number; negative: number; mixed: number } => {
	const result = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
	for (const answer of answers) {
		for (const m of answer.mentions) {
			if (m.isOwnBrand) result[m.sentiment] += 1;
		}
	}
	return result;
};

export const AiRadarPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/ai-radar' });
	const { t } = useTranslation('aiRadar');
	const [range, setRange] = useState<RangePreset>('28d');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});

	const answersQuery = useQuery({
		queryKey: ['project', projectId, 'ai-search', 'answers', RANGE_DAYS[range]],
		queryFn: () => api.aiSearch.listAnswersForProject(projectId, { limit: 500 }),
	});

	const filtered = useMemo(
		() => filterByRange(answersQuery.data?.items ?? [], RANGE_DAYS[range]),
		[answersQuery.data, range],
	);

	const sov = useMemo(() => computeSov(filtered), [filtered]);
	const mentionsTimeline = useMemo(() => computeMentionsTimeline(filtered), [filtered]);
	const citedDomains = useMemo(() => computeCitedDomains(filtered).slice(0, 12), [filtered]);
	const sentiment = useMemo(() => computeSentiment(filtered), [filtered]);

	const ownSov = sov.find((s) => s.isOwn);
	const ownAnswers = ownSov?.answers ?? 0;
	const totalAnswers = filtered.length;
	const ownAnswersPct = totalAnswers === 0 ? 0 : (ownAnswers / totalAnswers) * 100;
	const ownCitations = citedDomains.find((c) => c.isOwn);
	const totalCitations = citedDomains.reduce((acc, c) => acc + c.citations, 0);
	const citationRate = totalAnswers === 0 ? 0 : ((ownCitations?.citations ?? 0) / totalAnswers) * 100;

	const sovColumns: DataTableColumn<BrandSov>[] = [
		{
			key: 'brand',
			header: t('table.brand'),
			cell: (row) => (
				<span className={`break-words ${row.isOwn ? 'font-semibold text-primary' : 'font-medium'}`}>
					{row.brand}
					{row.isOwn ? (
						<Badge variant="default" className="ml-2">
							{t('badge.own')}
						</Badge>
					) : null}
				</span>
			),
		},
		{
			key: 'answers',
			header: t('table.answers'),
			cell: (row) => <span className="tabular-nums">{row.answers}</span>,
		},
		{
			key: 'sov',
			header: t('table.sov'),
			cell: (row) => (
				<div className="flex items-center gap-2">
					<div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted/40">
						<div className="h-full bg-primary" style={{ width: `${Math.min(row.pct, 100)}%` }} />
					</div>
					<span className="tabular-nums text-xs">{row.pct.toFixed(1)}%</span>
				</div>
			),
		},
		{
			key: 'pos',
			header: t('table.avgPosition'),
			cell: (row) => <span className="tabular-nums">{row.avgPosition.toFixed(1)}</span>,
			hideOnMobile: true,
		},
	];

	const citationColumns: DataTableColumn<CitedDomain>[] = [
		{
			key: 'domain',
			header: t('table.domain'),
			cell: (row) => (
				<span className={`break-all ${row.isOwn ? 'font-semibold text-primary' : 'font-medium'}`}>
					{row.domain}
					{row.isOwn ? (
						<Badge variant="default" className="ml-2">
							{t('badge.own')}
						</Badge>
					) : null}
				</span>
			),
		},
		{
			key: 'citations',
			header: t('table.citations'),
			cell: (row) => <span className="tabular-nums">{row.citations}</span>,
		},
		{
			key: 'urls',
			header: t('table.uniqueUrls'),
			cell: (row) => <span className="tabular-nums">{row.urls.size}</span>,
			hideOnMobile: true,
		},
	];

	if (projectQuery.isLoading || answersQuery.isLoading) {
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
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Sparkles size={20} className="text-primary" />
							{t('title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t(`range.${range}`)}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
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
						<Link to="/projects/$id/brand-prompts" params={{ id: projectId }}>
							<Button size="sm" variant="secondary">
								{t('manage')}
							</Button>
						</Link>
					</div>
				</header>

				{filtered.length === 0 ? (
					<EmptyState
						icon={<Sparkles size={32} />}
						title={t('empty.title')}
						description={t('empty.description')}
					/>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<KpiCard
								label={t('kpi.totalAnswers')}
								icon={<MessageSquareQuote size={14} />}
								value={totalAnswers.toString()}
								hint={t('kpi.totalAnswersHint')}
							/>
							<KpiCard
								label={t('kpi.sov')}
								icon={<Sparkles size={14} />}
								value={`${ownAnswersPct.toFixed(1)}%`}
								hint={t('kpi.sovHint', { count: ownAnswers })}
							/>
							<KpiCard
								label={t('kpi.citationRate')}
								icon={<Quote size={14} />}
								value={`${citationRate.toFixed(1)}%`}
								hint={t('kpi.citationRateHint', { count: ownCitations?.citations ?? 0 })}
							/>
							<KpiCard
								label={t('kpi.totalCitations')}
								icon={<Globe2 size={14} />}
								value={totalCitations.toString()}
								hint={t('kpi.totalCitationsHint')}
							/>
						</div>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('chart.title')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('chart.hint')}</p>
							</CardHeader>
							<CardContent className="h-72 sm:h-96">
								<ResponsiveContainer width="100%" height="100%">
									<ReLineChart data={mentionsTimeline} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="day" tick={{ fontSize: 11 }} />
										<YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
										<Tooltip />
										<Legend />
										{PROVIDERS.map((provider) => (
											<Line
												key={provider}
												type="monotone"
												dataKey={provider}
												stroke={PROVIDER_COLORS[provider]}
												strokeWidth={2}
												dot={{ r: 2 }}
											/>
										))}
									</ReLineChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="text-base">{t('sov.title')}</CardTitle>
								</CardHeader>
								<CardContent>
									<DataTable
										columns={sovColumns}
										rows={sov.slice(0, 10)}
										rowKey={(row) => `b-${row.brand}`}
										empty={t('sov.empty')}
									/>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base">
										<Smile size={14} className="text-muted-foreground" />
										{t('sentiment.title')}
									</CardTitle>
									<p className="text-xs text-muted-foreground">{t('sentiment.hint')}</p>
								</CardHeader>
								<CardContent>
									<SentimentBar sentiment={sentiment} />
								</CardContent>
							</Card>
						</div>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('citations.title')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('citations.hint')}</p>
							</CardHeader>
							<CardContent>
								<DataTable
									columns={citationColumns}
									rows={citedDomains}
									rowKey={(row) => `d-${row.domain}`}
									empty={t('citations.empty')}
								/>
							</CardContent>
						</Card>
					</>
				)}
			</div>
		</AppShell>
	);
};

const SentimentBar = ({
	sentiment,
}: {
	sentiment: { positive: number; neutral: number; negative: number; mixed: number };
}) => {
	const total = sentiment.positive + sentiment.neutral + sentiment.negative + sentiment.mixed;
	const { t } = useTranslation('aiRadar');
	if (total === 0) {
		return (
			<EmptyState
				icon={<ThumbsDown size={20} />}
				title={t('sentiment.empty')}
				description={t('sentiment.emptyHint')}
			/>
		);
	}
	const segments = [
		{ key: 'positive', value: sentiment.positive, color: 'bg-emerald-500' },
		{ key: 'neutral', value: sentiment.neutral, color: 'bg-slate-400' },
		{ key: 'mixed', value: sentiment.mixed, color: 'bg-amber-500' },
		{ key: 'negative', value: sentiment.negative, color: 'bg-red-500' },
	] as const;

	return (
		<div className="flex flex-col gap-3">
			<div
				className="flex h-3 w-full overflow-hidden rounded-full"
				role="img"
				aria-label={t('sentiment.title')}
			>
				{segments.map((s) => (
					<div
						key={s.key}
						className={s.color}
						style={{ width: `${(s.value / total) * 100}%` }}
						title={`${s.key} ${s.value}`}
					/>
				))}
			</div>
			<dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
				{segments.map((s) => (
					<div key={s.key} className="flex flex-col">
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">
							{t(`sentiment.${s.key}`)}
						</dt>
						<dd className="tabular-nums font-medium">
							{s.value} ({((s.value / total) * 100).toFixed(0)}%)
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
};
