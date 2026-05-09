import type { ProjectRankingItem } from '@rankpulse/sdk';
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
	FormField,
	Input,
	KpiCard,
	Spinner,
} from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowDown,
	ArrowUp,
	LineChart as LineChartIcon,
	Map as MapIcon,
	Plus,
	TrendingUp,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	CartesianGrid,
	Legend,
	Line,
	ReferenceLine,
	LineChart as ReLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { AppShell } from '../components/app-shell.js';
import { KeywordHistoryDrawer } from '../components/keyword-history-drawer.js';
import { api } from '../lib/api.js';

const PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

interface KeywordSeries {
	id: string;
	phrase: string;
	domain: string;
	color: string;
	points: { date: string; position: number | null }[];
	currentPosition: number | null;
}

interface DeltaRow extends ProjectRankingItem {
	previousPosition: number | null;
	delta: number | null;
}

const groupByKeyword = (rows: readonly ProjectRankingItem[]): KeywordSeries[] => {
	const grouped = new Map<string, ProjectRankingItem[]>();
	for (const r of rows) {
		const key = `${r.trackedKeywordId}`;
		const list = grouped.get(key) ?? [];
		list.push(r);
		grouped.set(key, list);
	}
	const series: KeywordSeries[] = [];
	let i = 0;
	for (const [id, items] of grouped.entries()) {
		const sorted = [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
		const first = sorted[0];
		if (!first) continue;
		const last = sorted[sorted.length - 1];
		series.push({
			id,
			phrase: first.phrase,
			domain: first.domain,
			color: PALETTE[i % PALETTE.length] ?? '#22c55e',
			points: sorted.map((r) => ({ date: r.observedAt.slice(0, 10), position: r.position })),
			currentPosition: last?.position ?? null,
		});
		i += 1;
	}
	return series;
};

const computeMovers = (rows: readonly ProjectRankingItem[]): { winners: DeltaRow[]; losers: DeltaRow[] } => {
	const grouped = new Map<string, ProjectRankingItem[]>();
	for (const r of rows) {
		const key = r.trackedKeywordId;
		const list = grouped.get(key) ?? [];
		list.push(r);
		grouped.set(key, list);
	}
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
	const sevenIso = sevenDaysAgo.toISOString();

	const deltas: DeltaRow[] = [];
	for (const items of grouped.values()) {
		const sorted = [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
		const latest = sorted[sorted.length - 1];
		const previous = [...sorted].reverse().find((r) => r.observedAt < sevenIso) ?? sorted[0];
		if (!latest || !previous || latest === previous) continue;
		const lp = latest.position;
		const pp = previous.position;
		if (lp === null && pp === null) continue;
		const delta = lp === null || pp === null ? null : pp - lp;
		deltas.push({ ...latest, previousPosition: pp, delta });
	}
	const ranked = deltas.filter((d) => d.delta !== null) as (DeltaRow & { delta: number })[];
	const winners = ranked
		.filter((d) => d.delta > 0)
		.sort((a, b) => b.delta - a.delta)
		.slice(0, 5);
	const losers = ranked
		.filter((d) => d.delta < 0)
		.sort((a, b) => a.delta - b.delta)
		.slice(0, 5);
	return { winners, losers };
};

const filterByRange = (rows: readonly ProjectRankingItem[], days: number): ProjectRankingItem[] => {
	const cutoff = new Date();
	cutoff.setUTCDate(cutoff.getUTCDate() - days);
	const cutoffIso = cutoff.toISOString();
	return rows.filter((r) => r.observedAt >= cutoffIso);
};

type RangePreset = '7d' | '28d' | '90d';
const RANGE_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90 };

const buildLatestTable = (rows: readonly ProjectRankingItem[]): DeltaRow[] => {
	const grouped = new Map<string, ProjectRankingItem[]>();
	for (const r of rows) {
		const key = r.trackedKeywordId;
		const list = grouped.get(key) ?? [];
		list.push(r);
		grouped.set(key, list);
	}
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
	const sevenIso = sevenDaysAgo.toISOString();

	const out: DeltaRow[] = [];
	for (const items of grouped.values()) {
		const sorted = [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
		const latest = sorted[sorted.length - 1];
		if (!latest) continue;
		const previous = [...sorted].reverse().find((r) => r.observedAt < sevenIso);
		const lp = latest.position;
		const pp = previous?.position ?? null;
		const delta = lp === null || pp === null ? null : pp - lp;
		out.push({ ...latest, previousPosition: pp, delta });
	}
	return out.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
};

export const RankingsPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/rankings' });
	const { t } = useTranslation(['common', 'rankings', 'rankingsBoard']);
	const [showForm, setShowForm] = useState(false);
	const [historyOf, setHistoryOf] = useState<{ trackedKeywordId: string; phrase: string } | null>(null);
	const [range, setRange] = useState<RangePreset>('28d');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});

	const filteredRows = useMemo(
		() => filterByRange(rankingsQuery.data ?? [], RANGE_DAYS[range]),
		[rankingsQuery.data, range],
	);

	const seriesAll = useMemo(() => groupByKeyword(filteredRows), [filteredRows]);
	const movers = useMemo(() => computeMovers(filteredRows), [filteredRows]);
	const tableRows = useMemo(() => buildLatestTable(filteredRows), [filteredRows]);

	const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(new Set());

	const visibleSeries = useMemo(() => {
		if (selectedKeywordIds.size === 0) {
			const ranked = [...tableRows]
				.filter((r) => r.position !== null)
				.slice(0, 5)
				.map((r) => r.trackedKeywordId);
			return seriesAll.filter((s) => ranked.includes(s.id));
		}
		return seriesAll.filter((s) => selectedKeywordIds.has(s.id));
	}, [seriesAll, selectedKeywordIds, tableRows]);

	const chartData = useMemo(() => {
		const allDates = new Set<string>();
		for (const s of visibleSeries) for (const p of s.points) allDates.add(p.date);
		const sortedDates = [...allDates].sort();
		return sortedDates.map((date) => {
			const row: Record<string, string | number | null> = { date };
			for (const s of visibleSeries) {
				const point = s.points.find((p) => p.date === date);
				row[s.phrase] = point?.position ?? null;
			}
			return row;
		});
	}, [visibleSeries]);

	const summary = useMemo(() => {
		const ranked = tableRows.filter((r) => r.position !== null);
		const trackedCount = tableRows.length;
		const inTop10 = ranked.filter((r) => (r.position ?? 999) <= 10).length;
		const inTop3 = ranked.filter((r) => (r.position ?? 999) <= 3).length;
		const avg =
			ranked.length === 0 ? null : ranked.reduce((a, r) => a + (r.position ?? 0), 0) / ranked.length;
		return { trackedCount, inTop10, inTop3, avg };
	}, [tableRows]);

	const toggleKeyword = (id: string): void => {
		setSelectedKeywordIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const tableColumns: DataTableColumn<DeltaRow>[] = [
		{
			key: 'phrase',
			header: t('rankings:phrase'),
			cell: (row) => (
				<button
					type="button"
					className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					onClick={() => setHistoryOf({ trackedKeywordId: row.trackedKeywordId, phrase: row.phrase })}
				>
					<span className="font-medium">{row.phrase}</span>
					<span className="block text-xs text-muted-foreground">{row.domain}</span>
				</button>
			),
		},
		{
			key: 'country',
			header: t('rankings:country'),
			cell: (row) => (
				<Badge variant="secondary">
					{row.country} · {row.language}
				</Badge>
			),
			hideOnMobile: true,
		},
		{
			key: 'device',
			header: t('rankings:device'),
			cell: (row) => <Badge variant={row.device === 'desktop' ? 'default' : 'warning'}>{row.device}</Badge>,
			hideOnMobile: true,
		},
		{
			key: 'position',
			header: t('rankings:position'),
			cell: (row) =>
				row.position === null ? (
					<span className="text-muted-foreground">{t('common:notRanked')}</span>
				) : (
					<span className="font-mono font-semibold">#{row.position}</span>
				),
		},
		{
			key: 'delta',
			header: t('rankingsBoard:delta'),
			cell: (row) => <DeltaCell delta={row.delta} />,
		},
		{
			key: 'observedAt',
			header: t('rankings:observedAt'),
			cell: (row) => (
				<span className="text-xs text-muted-foreground">{new Date(row.observedAt).toLocaleString()}</span>
			),
			hideOnMobile: true,
		},
	];

	if (projectQuery.isLoading || rankingsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const project = projectQuery.data;
	const rankings = rankingsQuery.data ?? [];

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{t('rankings:title')}</h1>
						<p className="text-sm text-muted-foreground">
							{project?.name} · {t('rankings:subtitle')}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<div className="flex flex-wrap gap-1" role="tablist" aria-label={t('rankingsBoard:rangeLabel')}>
							{(['7d', '28d', '90d'] as RangePreset[]).map((preset) => (
								<Button
									key={preset}
									type="button"
									size="sm"
									variant={range === preset ? 'primary' : 'secondary'}
									onClick={() => setRange(preset)}
									aria-pressed={range === preset}
								>
									{t(`rankingsBoard:range.${preset}`)}
								</Button>
							))}
						</div>
						<Link to="/projects/$id/serp-map" params={{ id: projectId }}>
							<Button variant="secondary" size="sm">
								<MapIcon size={14} />
								{t('rankingsBoard:openSerpMap')}
							</Button>
						</Link>
						<Button onClick={() => setShowForm((v) => !v)}>
							<Plus size={16} />
							{t('rankings:track')}
						</Button>
					</div>
				</header>

				{showForm && project ? (
					<TrackKeywordForm
						projectId={projectId}
						defaultDomain={project.primaryDomain}
						onCreated={() => setShowForm(false)}
					/>
				) : null}

				{rankings.length === 0 ? (
					<EmptyState
						icon={<LineChartIcon size={32} />}
						title={t('rankings:empty')}
						description={t('rankings:emptyDescription')}
					/>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<KpiCard label={t('rankingsBoard:tracked')} value={summary.trackedCount.toString()} />
							<KpiCard
								label={t('rankingsBoard:avgPosition')}
								value={summary.avg === null ? '—' : `#${summary.avg.toFixed(1)}`}
								hint={t('rankingsBoard:avgHint')}
							/>
							<KpiCard
								label={t('rankingsBoard:top10')}
								value={summary.inTop10.toString()}
								hint={t('rankingsBoard:top10Hint', { total: summary.trackedCount })}
							/>
							<KpiCard
								label={t('rankingsBoard:top3')}
								value={summary.inTop3.toString()}
								hint={t('rankingsBoard:top3Hint', { total: summary.trackedCount })}
							/>
						</div>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('rankingsBoard:chartTitle')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('rankingsBoard:chartHint')}</p>
							</CardHeader>
							<CardContent className="h-72 sm:h-96">
								{visibleSeries.length === 0 ? (
									<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
										{t('rankingsBoard:chartEmpty')}
									</div>
								) : (
									<ResponsiveContainer width="100%" height="100%">
										<ReLineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis dataKey="date" tick={{ fontSize: 11 }} />
											<YAxis
												reversed
												domain={[1, 'dataMax']}
												tick={{ fontSize: 11 }}
												label={{ value: '#', angle: -90, position: 'insideLeft', fontSize: 11 }}
											/>
											<Tooltip />
											<Legend />
											<ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="4 4" />
											{visibleSeries.map((s) => (
												<Line
													key={s.id}
													type="monotone"
													dataKey={s.phrase}
													stroke={s.color}
													strokeWidth={2}
													dot={{ r: 2 }}
													connectNulls
												/>
											))}
										</ReLineChart>
									</ResponsiveContainer>
								)}
							</CardContent>
						</Card>

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<MoversCard
								title={t('rankingsBoard:winners')}
								empty={t('rankingsBoard:noMovers')}
								rows={movers.winners}
								variant="winner"
							/>
							<MoversCard
								title={t('rankingsBoard:losers')}
								empty={t('rankingsBoard:noMovers')}
								rows={movers.losers}
								variant="loser"
							/>
						</div>

						<Card>
							<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<CardTitle className="text-base">{t('rankingsBoard:tableTitle')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('rankingsBoard:tableHint')}</p>
							</CardHeader>
							<CardContent>
								<DataTable
									columns={tableColumns}
									rows={tableRows.map((row) => ({
										...row,
										__highlighted: selectedKeywordIds.has(row.trackedKeywordId),
									}))}
									rowKey={(row) => row.trackedKeywordId}
									empty={t('rankingsBoard:tableEmpty')}
								/>
								<div className="mt-3 flex flex-wrap gap-1">
									{seriesAll.map((s) => (
										<Button
											key={s.id}
											size="sm"
											variant={selectedKeywordIds.has(s.id) ? 'primary' : 'ghost'}
											onClick={() => toggleKeyword(s.id)}
										>
											<span
												aria-hidden
												className="mr-1 inline-block h-2 w-2 rounded-full"
												style={{ background: s.color }}
											/>
											{s.phrase}
										</Button>
									))}
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('rankingsBoard:rawTitle')}</CardTitle>
							</CardHeader>
							<CardContent>
								<DataTable
									columns={rawObservationColumns(t, setHistoryOf)}
									rows={[...rankings].sort((a, b) => b.observedAt.localeCompare(a.observedAt))}
									rowKey={(row) => `${row.trackedKeywordId}-${row.observedAt}`}
									empty={t('rankingsBoard:rawEmpty')}
								/>
							</CardContent>
						</Card>
					</>
				)}
			</div>
			<KeywordHistoryDrawer
				open={Boolean(historyOf)}
				onClose={() => setHistoryOf(null)}
				trackedKeywordId={historyOf?.trackedKeywordId ?? null}
				phrase={historyOf?.phrase ?? null}
			/>
		</AppShell>
	);
};

type Translator = (key: string, options?: Record<string, unknown>) => string;

const rawObservationColumns = (
	t: Translator,
	setHistoryOf: (entry: { trackedKeywordId: string; phrase: string }) => void,
): DataTableColumn<ProjectRankingItem>[] => [
	{
		key: 'phrase',
		header: t('rankings:phrase'),
		cell: (row) => (
			<button
				type="button"
				className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				onClick={() => setHistoryOf({ trackedKeywordId: row.trackedKeywordId, phrase: row.phrase })}
			>
				<span className="font-medium">{row.phrase}</span>
				<span className="block text-xs text-muted-foreground">{row.domain}</span>
			</button>
		),
	},
	{
		key: 'country',
		header: t('rankings:country'),
		cell: (row) => (
			<Badge variant="secondary">
				{row.country} · {row.language}
			</Badge>
		),
		hideOnMobile: true,
	},
	{
		key: 'device',
		header: t('rankings:device'),
		cell: (row) => <Badge variant={row.device === 'desktop' ? 'default' : 'warning'}>{row.device}</Badge>,
		hideOnMobile: true,
	},
	{
		key: 'position',
		header: t('rankings:position'),
		cell: (row) =>
			row.position === null ? (
				<span className="text-muted-foreground">{t('common:notRanked')}</span>
			) : (
				<span className="font-mono font-semibold">#{row.position}</span>
			),
	},
	{
		key: 'observedAt',
		header: t('rankings:observedAt'),
		cell: (row) => (
			<span className="text-xs text-muted-foreground">{new Date(row.observedAt).toLocaleString()}</span>
		),
		hideOnMobile: true,
	},
];

const DeltaCell = ({ delta }: { delta: number | null }) => {
	if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;
	if (delta === 0) return <span className="text-xs text-muted-foreground">±0</span>;
	const Icon = delta > 0 ? ArrowUp : ArrowDown;
	const color = delta > 0 ? 'text-emerald-600' : 'text-destructive';
	return (
		<span className={`inline-flex items-center gap-1 font-mono text-xs ${color}`}>
			<Icon size={12} />
			{Math.abs(delta).toFixed(0)}
		</span>
	);
};

const MoversCard = ({
	title,
	empty,
	rows,
	variant,
}: {
	title: string;
	empty: string;
	rows: DeltaRow[];
	variant: 'winner' | 'loser';
}) => (
	<Card>
		<CardHeader className="flex flex-row items-center justify-between gap-2">
			<CardTitle className="flex items-center gap-2 text-base">
				<TrendingUp size={14} className={variant === 'winner' ? 'text-emerald-600' : 'text-destructive'} />
				{title}
			</CardTitle>
		</CardHeader>
		<CardContent>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{empty}</p>
			) : (
				<ul className="flex flex-col gap-2 text-sm">
					{rows.map((row) => (
						<li key={row.trackedKeywordId} className="flex items-center justify-between gap-2">
							<span className="break-words">
								<span className="font-medium">{row.phrase}</span>{' '}
								<span className="text-xs text-muted-foreground">
									{row.previousPosition ? `#${row.previousPosition}→#${row.position}` : `#${row.position}`}
								</span>
							</span>
							<DeltaCell delta={row.delta} />
						</li>
					))}
				</ul>
			)}
		</CardContent>
	</Card>
);

const TrackKeywordForm = ({
	projectId,
	defaultDomain,
	onCreated,
}: {
	projectId: string;
	defaultDomain: string;
	onCreated: () => void;
}) => {
	const { t } = useTranslation(['common', 'rankings']);
	const queryClient = useQueryClient();
	const [phrase, setPhrase] = useState('');
	const [domain, setDomain] = useState(defaultDomain);
	const [country, setCountry] = useState('ES');
	const [language, setLanguage] = useState('es');
	const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			api.rankTracking.startTracking({
				projectId,
				domain,
				phrase,
				country,
				language,
				device,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project', projectId, 'rankings'] });
			onCreated();
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : 'Could not start tracking');
		},
	});

	const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{t('rankings:track')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
					<FormField label={t('rankings:phrase')}>
						{(id) => <Input id={id} required value={phrase} onChange={(e) => setPhrase(e.target.value)} />}
					</FormField>
					<FormField label="Domain">
						{(id) => <Input id={id} required value={domain} onChange={(e) => setDomain(e.target.value)} />}
					</FormField>
					<FormField label={t('rankings:country')} hint="ISO-3166 alpha-2 (uppercase)">
						{(id) => (
							<Input
								id={id}
								required
								maxLength={2}
								value={country}
								onChange={(e) => setCountry(e.target.value.toUpperCase())}
							/>
						)}
					</FormField>
					<FormField label={t('rankings:language')}>
						{(id) => (
							<Input id={id} required value={language} onChange={(e) => setLanguage(e.target.value)} />
						)}
					</FormField>
					<FormField label={t('rankings:device')} error={error ?? undefined}>
						{(id) => (
							<select
								id={id}
								value={device}
								onChange={(e) => setDevice(e.target.value as 'desktop' | 'mobile')}
								className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm"
							>
								<option value="desktop">desktop</option>
								<option value="mobile">mobile</option>
							</select>
						)}
					</FormField>
					<div className="flex gap-2 md:col-span-2">
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? t('common:loading') : t('common:save')}
						</Button>
						<Button type="button" variant="secondary" onClick={onCreated}>
							{t('common:cancel')}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
};
