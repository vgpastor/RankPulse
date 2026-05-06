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
import { ArrowLeft, Search, Shield, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

interface KeywordPositions {
	phrase: string;
	ourBest: { domain: string; position: number } | null;
	competitorPositions: Map<string, number>;
}

interface GapRow {
	phrase: string;
	competitorDomain: string;
	competitorPosition: number;
	ourPosition: number | null;
	gap: number | null;
}

const buildKeywordMap = (
	rankings: readonly ProjectRankingItem[],
	ownDomains: Set<string>,
): Map<string, KeywordPositions> => {
	const latestPerKwDomain = new Map<string, ProjectRankingItem>();
	for (const r of rankings) {
		const key = `${r.phrase}::${r.domain}`;
		const cur = latestPerKwDomain.get(key);
		if (!cur || r.observedAt > cur.observedAt) latestPerKwDomain.set(key, r);
	}
	const out = new Map<string, KeywordPositions>();
	for (const r of latestPerKwDomain.values()) {
		const cur = out.get(r.phrase) ?? {
			phrase: r.phrase,
			ourBest: null,
			competitorPositions: new Map<string, number>(),
		};
		if (ownDomains.has(r.domain)) {
			if (r.position !== null && (cur.ourBest === null || r.position < cur.ourBest.position)) {
				cur.ourBest = { domain: r.domain, position: r.position };
			}
		} else if (r.position !== null) {
			const existing = cur.competitorPositions.get(r.domain);
			if (existing === undefined || r.position < existing) cur.competitorPositions.set(r.domain, r.position);
		}
		out.set(r.phrase, cur);
	}
	return out;
};

export const GapAnalysisPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/gap-analysis' });
	const { t } = useTranslation('gapAnalysis');
	const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});
	const competitorsQuery = useQuery({
		queryKey: ['project', projectId, 'competitors'],
		queryFn: () => api.projects.listCompetitors(projectId),
	});

	const ownDomains = useMemo(
		() => new Set(projectQuery.data?.domains.map((d) => d.domain) ?? []),
		[projectQuery.data],
	);

	const keywordMap = useMemo(
		() => buildKeywordMap(rankingsQuery.data ?? [], ownDomains),
		[rankingsQuery.data, ownDomains],
	);

	const competitors = competitorsQuery.data ?? [];
	const activeCompetitor = selectedCompetitor ?? competitors[0]?.domain ?? null;

	const analysis = useMemo(() => {
		if (!activeCompetitor) return { gapPure: [], behind: [], ahead: [] };
		const gapPure: GapRow[] = [];
		const behind: GapRow[] = [];
		const ahead: GapRow[] = [];
		for (const k of keywordMap.values()) {
			const compPos = k.competitorPositions.get(activeCompetitor);
			if (compPos === undefined) continue;
			const ourPos = k.ourBest?.position ?? null;
			const row: GapRow = {
				phrase: k.phrase,
				competitorDomain: activeCompetitor,
				competitorPosition: compPos,
				ourPosition: ourPos,
				gap: ourPos === null ? null : ourPos - compPos,
			};
			if (ourPos === null) gapPure.push(row);
			else if (ourPos > compPos) behind.push(row);
			else if (ourPos < compPos) ahead.push(row);
		}
		gapPure.sort((a, b) => a.competitorPosition - b.competitorPosition);
		behind.sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
		ahead.sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
		return { gapPure, behind, ahead };
	}, [keywordMap, activeCompetitor]);

	const buildColumns = (variant: 'gap' | 'behind' | 'ahead'): DataTableColumn<GapRow>[] => [
		{
			key: 'phrase',
			header: t('table.phrase'),
			cell: (row) => <span className="font-medium">{row.phrase}</span>,
		},
		{
			key: 'theirs',
			header: t('table.theirs'),
			cell: (row) => <span className="font-mono">#{row.competitorPosition}</span>,
		},
		{
			key: 'ours',
			header: t('table.ours'),
			cell: (row) =>
				row.ourPosition === null ? (
					<span className="text-xs text-muted-foreground">{t('table.notRanked')}</span>
				) : (
					<span className="font-mono">#{row.ourPosition}</span>
				),
		},
		{
			key: 'gap',
			header: t('table.gap'),
			cell: (row) => {
				if (row.gap === null) return <Badge variant="warning">{t('table.gapNew')}</Badge>;
				if (variant === 'ahead') return <Badge variant="success">{`+${Math.abs(row.gap)}`}</Badge>;
				return <Badge variant="destructive">{`-${row.gap}`}</Badge>;
			},
		},
	];

	if (projectQuery.isLoading || rankingsQuery.isLoading || competitorsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	if (competitors.length === 0) {
		return (
			<AppShell>
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
					<EmptyState
						icon={<Swords size={32} />}
						title={t('empty.title')}
						description={t('empty.description')}
						action={
							<Link to="/projects/$id/competitors" params={{ id: projectId }}>
								<Button size="sm">{t('empty.cta')}</Button>
							</Link>
						}
					/>
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
							<Swords size={20} className="text-primary" />
							{t('title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t('subtitle')}
						</p>
					</div>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('selector.title')}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-1" role="tablist" aria-label={t('selector.label')}>
							{competitors.map((c) => (
								<Button
									key={c.id}
									type="button"
									size="sm"
									variant={activeCompetitor === c.domain ? 'primary' : 'secondary'}
									onClick={() => setSelectedCompetitor(c.domain)}
									aria-pressed={activeCompetitor === c.domain}
								>
									{c.label}
								</Button>
							))}
						</div>
					</CardContent>
				</Card>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<KpiCard
						label={t('kpi.gap')}
						icon={<Search size={14} />}
						value={analysis.gapPure.length.toString()}
						hint={t('kpi.gapHint')}
					/>
					<KpiCard
						label={t('kpi.behind')}
						icon={<Swords size={14} />}
						value={analysis.behind.length.toString()}
						hint={t('kpi.behindHint')}
					/>
					<KpiCard
						label={t('kpi.ahead')}
						icon={<Shield size={14} />}
						value={analysis.ahead.length.toString()}
						hint={t('kpi.aheadHint')}
					/>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('sections.gap.title')}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('sections.gap.hint')}</p>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={buildColumns('gap')}
							rows={analysis.gapPure}
							rowKey={(row) => `g-${row.phrase}`}
							empty={t('sections.gap.empty')}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('sections.behind.title')}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('sections.behind.hint')}</p>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={buildColumns('behind')}
							rows={analysis.behind}
							rowKey={(row) => `b-${row.phrase}`}
							empty={t('sections.behind.empty')}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('sections.ahead.title')}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('sections.ahead.hint')}</p>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={buildColumns('ahead')}
							rows={analysis.ahead}
							rowKey={(row) => `a-${row.phrase}`}
							empty={t('sections.ahead.empty')}
						/>
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
};
