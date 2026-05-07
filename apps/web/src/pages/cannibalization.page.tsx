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
	KpiCard,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, GitMerge } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

interface CannibalRow {
	phrase: string;
	domains: { domain: string; position: number }[];
	score: 0 | 1 | 2 | 3;
}

const computeScore = (positions: number[]): 0 | 1 | 2 | 3 => {
	if (positions.length <= 1) return 0;
	const sorted = [...positions].sort((a, b) => a - b);
	if (sorted.length >= 3) return 3;
	const [first, second] = sorted;
	if (first === undefined || second === undefined) return 0;
	if (second - first >= 15) return 1;
	return 2;
};

const buildRows = (rankings: readonly ProjectRankingItem[], ownDomains: Set<string>): CannibalRow[] => {
	const latestPerKwDomain = new Map<string, ProjectRankingItem>();
	for (const r of rankings) {
		if (!ownDomains.has(r.domain)) continue;
		const key = `${r.phrase}::${r.domain}`;
		const cur = latestPerKwDomain.get(key);
		if (!cur || r.observedAt > cur.observedAt) latestPerKwDomain.set(key, r);
	}
	const grouped = new Map<string, { domain: string; position: number }[]>();
	for (const r of latestPerKwDomain.values()) {
		if (r.position === null) continue;
		const cur = grouped.get(r.phrase) ?? [];
		cur.push({ domain: r.domain, position: r.position });
		grouped.set(r.phrase, cur);
	}
	const out: CannibalRow[] = [];
	for (const [phrase, list] of grouped.entries()) {
		const sorted = [...list].sort((a, b) => a.position - b.position);
		const score = computeScore(sorted.map((d) => d.position));
		out.push({ phrase, domains: sorted, score });
	}
	return out.sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase));
};

const recommendation = (
	row: CannibalRow,
	t: (key: string, vars?: Record<string, unknown>) => string,
): string => {
	if (row.score === 0) return t('rec.clean');
	if (row.score === 1) return t('rec.acceptable');
	if (row.score === 2 && row.domains.length >= 2) {
		const [winner, loser] = row.domains;
		return t('rec.consolidate', { winner: winner?.domain ?? '', loser: loser?.domain ?? '' });
	}
	return t('rec.specialize', { count: row.domains.length });
};

export const CannibalizationPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/cannibalization' });
	const { t } = useTranslation('cannibalization');
	const [showOnlyProblems, setShowOnlyProblems] = useState(false);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});

	const ownDomains = useMemo(
		() => new Set(projectQuery.data?.domains.map((d) => d.domain) ?? []),
		[projectQuery.data],
	);

	const rows = useMemo(
		() => buildRows(rankingsQuery.data ?? [], ownDomains),
		[rankingsQuery.data, ownDomains],
	);
	const filtered = useMemo(
		() => (showOnlyProblems ? rows.filter((r) => r.score >= 2) : rows),
		[rows, showOnlyProblems],
	);

	const summary = useMemo(() => {
		const total = rows.length;
		const clean = rows.filter((r) => r.score === 0).length;
		const acceptable = rows.filter((r) => r.score === 1).length;
		const problems = rows.filter((r) => r.score >= 2).length;
		return { total, clean, acceptable, problems };
	}, [rows]);

	const columns: DataTableColumn<CannibalRow>[] = [
		{
			key: 'phrase',
			header: t('table.keyword'),
			cell: (row) => <span className="font-medium">{row.phrase}</span>,
		},
		{
			key: 'score',
			header: t('table.score'),
			cell: (row) => (
				<Badge
					variant={
						row.score === 0
							? 'success'
							: row.score === 1
								? 'secondary'
								: row.score === 2
									? 'warning'
									: 'destructive'
					}
				>
					{t(`score.${row.score}`)}
				</Badge>
			),
		},
		{
			key: 'domains',
			header: t('table.domains'),
			cell: (row) => (
				<div className="flex flex-wrap gap-1">
					{row.domains.map((d) => (
						<span
							key={d.domain}
							className="inline-flex items-center gap-1 rounded bg-muted/40 px-2 py-0.5 text-xs"
						>
							<span className="font-mono">#{d.position}</span>
							<span className="break-all">{d.domain}</span>
						</span>
					))}
				</div>
			),
		},
		{
			key: 'rec',
			header: t('table.recommendation'),
			cell: (row) => <span className="text-xs text-muted-foreground">{recommendation(row, t)}</span>,
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
							<GitMerge size={20} className="text-primary" />
							{t('title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t('subtitle')}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant={showOnlyProblems ? 'primary' : 'secondary'}
						onClick={() => setShowOnlyProblems((v) => !v)}
						aria-pressed={showOnlyProblems}
					>
						{showOnlyProblems ? t('filterOff') : t('filterOn')}
					</Button>
				</header>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<KpiCard label={t('kpi.total')} value={summary.total.toString()} hint={t('kpi.totalHint')} />
					<KpiCard label={t('kpi.clean')} value={summary.clean.toString()} hint={t('kpi.cleanHint')} />
					<KpiCard
						label={t('kpi.acceptable')}
						value={summary.acceptable.toString()}
						hint={t('kpi.acceptableHint')}
					/>
					<KpiCard
						label={t('kpi.problems')}
						icon={<AlertTriangle size={14} />}
						value={summary.problems.toString()}
						hint={t('kpi.problemsHint')}
					/>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('table.title', { count: filtered.length })}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('table.hint')}</p>
					</CardHeader>
					<CardContent>
						{filtered.length === 0 ? (
							<EmptyState
								title={showOnlyProblems ? t('empty.noProblems.title') : t('empty.noData.title')}
								description={
									showOnlyProblems ? t('empty.noProblems.description') : t('empty.noData.description')
								}
							/>
						) : (
							<DataTable
								columns={columns}
								rows={filtered}
								rowKey={(row) => `c-${row.phrase}`}
								empty={t('empty.noData.title')}
							/>
						)}
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
};
