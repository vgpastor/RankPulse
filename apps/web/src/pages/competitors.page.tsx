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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Plus, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddCompetitorDrawer } from '../components/add-competitor-drawer.js';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

interface HeatmapCellData {
	domain: string;
	position: number | null;
	url: string | null;
	isOwn: boolean;
}

interface HeatmapRow {
	keyword: string;
	cells: Map<string, HeatmapCellData>;
}

const positionColor = (pos: number | null): string => {
	if (pos === null) return 'bg-muted/30 text-muted-foreground';
	if (pos <= 3) return 'bg-emerald-500/20 text-emerald-700';
	if (pos <= 10) return 'bg-amber-500/20 text-amber-700';
	return 'bg-red-500/20 text-red-700';
};

const visibilityScore = (positions: readonly (number | null)[]): number => {
	let score = 0;
	for (const pos of positions) {
		if (pos === null) continue;
		score += 1 / pos;
	}
	return score;
};

export const CompetitorsPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/competitors' });
	const { t } = useTranslation('competitors');
	const qc = useQueryClient();
	const [addOpen, setAddOpen] = useState(false);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const competitorsQuery = useQuery({
		queryKey: ['project', projectId, 'competitors'],
		queryFn: () => api.projects.listCompetitors(projectId),
	});
	const suggestionsQuery = useQuery({
		queryKey: ['project', projectId, 'competitor-suggestions'],
		queryFn: () => api.projects.listCompetitorSuggestions(projectId),
	});
	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});

	const promoteSuggestion = useMutation({
		mutationFn: (suggestionId: string) => api.projects.promoteCompetitorSuggestion(suggestionId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'competitor-suggestions'] });
			qc.invalidateQueries({ queryKey: ['project', projectId, 'competitors'] });
		},
	});

	const ownDomains = useMemo(
		() => new Set(projectQuery.data?.domains.map((d) => d.domain) ?? []),
		[projectQuery.data],
	);
	const competitorDomains = useMemo(
		() => competitorsQuery.data?.map((c) => c.domain) ?? [],
		[competitorsQuery.data],
	);

	const heatmap = useMemo<{ rows: HeatmapRow[]; columns: { domain: string; isOwn: boolean }[] }>(() => {
		const rankings = rankingsQuery.data ?? [];
		const domains = new Set<string>();
		for (const r of rankings) domains.add(r.domain);
		for (const d of competitorDomains) domains.add(d);
		for (const d of ownDomains) domains.add(d);
		const sortedDomains = [...domains].sort();
		const columns = sortedDomains.map((domain) => ({ domain, isOwn: ownDomains.has(domain) }));

		const keywordMap = new Map<string, HeatmapRow>();
		for (const r of rankings) {
			const row = keywordMap.get(r.phrase) ?? { keyword: r.phrase, cells: new Map() };
			row.cells.set(r.domain, {
				domain: r.domain,
				position: r.position,
				url: r.url,
				isOwn: ownDomains.has(r.domain),
			});
			keywordMap.set(r.phrase, row);
		}
		const rows = [...keywordMap.values()].sort((a, b) => a.keyword.localeCompare(b.keyword));
		return { rows, columns };
	}, [rankingsQuery.data, ownDomains, competitorDomains]);

	const visibility = useMemo(() => {
		return heatmap.columns.map((col) => {
			const positions: (number | null)[] = [];
			for (const row of heatmap.rows) {
				const cell = row.cells.get(col.domain);
				positions.push(cell?.position ?? null);
			}
			return { domain: col.domain, isOwn: col.isOwn, score: visibilityScore(positions) };
		});
	}, [heatmap]);

	const visibilitySorted = useMemo(() => [...visibility].sort((a, b) => b.score - a.score), [visibility]);
	const ownVisibility = visibility.find((v) => v.isOwn);
	const ourRank = ownVisibility
		? visibilitySorted.findIndex((v) => v.domain === ownVisibility.domain) + 1
		: null;

	const movement = useMemo(() => {
		const winners: {
			keyword: string;
			ownPos: number;
			bestCompetitor: { domain: string; pos: number } | null;
		}[] = [];
		const losers: {
			keyword: string;
			ownPos: number;
			worstCompetitor: { domain: string; pos: number } | null;
		}[] = [];
		for (const row of heatmap.rows) {
			let ownPos: number | null = null;
			for (const [domain, cell] of row.cells) {
				if (ownDomains.has(domain) && cell.position !== null) {
					if (ownPos === null || cell.position < ownPos) ownPos = cell.position;
				}
			}
			if (ownPos === null) continue;
			let bestCompetitor: { domain: string; pos: number } | null = null;
			let worstCompetitor: { domain: string; pos: number } | null = null;
			for (const [domain, cell] of row.cells) {
				if (ownDomains.has(domain) || cell.position === null) continue;
				if (!bestCompetitor || cell.position < bestCompetitor.pos)
					bestCompetitor = { domain, pos: cell.position };
				if (!worstCompetitor || cell.position > worstCompetitor.pos)
					worstCompetitor = { domain, pos: cell.position };
			}
			if (bestCompetitor && bestCompetitor.pos > ownPos)
				winners.push({ keyword: row.keyword, ownPos, bestCompetitor });
			else if (bestCompetitor && bestCompetitor.pos < ownPos)
				losers.push({ keyword: row.keyword, ownPos, worstCompetitor: bestCompetitor });
		}
		return { winners: winners.slice(0, 8), losers: losers.slice(0, 8) };
	}, [heatmap, ownDomains]);

	if (projectQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const competitors = competitorsQuery.data ?? [];
	const suggestions = suggestionsQuery.data ?? [];

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Users size={20} className="text-primary" />
							{t('title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {competitors.length} {t('subtitleCount')}
						</p>
					</div>
					<Button size="sm" onClick={() => setAddOpen(true)}>
						<Plus size={14} />
						{t('add')}
					</Button>
				</header>

				{competitors.length === 0 && heatmap.rows.length === 0 ? (
					<EmptyState
						icon={<Users size={32} />}
						title={t('empty.title')}
						description={t('empty.description')}
						action={
							<Button size="sm" onClick={() => setAddOpen(true)}>
								<Plus size={14} />
								{t('add')}
							</Button>
						}
					/>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<KpiCard
								label={t('kpi.tracked')}
								icon={<Users size={14} />}
								value={competitors.length.toString()}
								hint={t('kpi.trackedHint')}
							/>
							<KpiCard
								label={t('kpi.keywords')}
								value={heatmap.rows.length.toString()}
								hint={t('kpi.keywordsHint')}
							/>
							<KpiCard
								label={t('kpi.ourRank')}
								icon={<Trophy size={14} />}
								value={ourRank ? `#${ourRank}` : '—'}
								hint={t('kpi.ourRankHint', { total: visibility.length })}
							/>
							<KpiCard
								label={t('kpi.visibility')}
								value={(ownVisibility?.score ?? 0).toFixed(2)}
								hint={t('kpi.visibilityHint')}
							/>
						</div>

						{competitors.length === 0 ? (
							<Card>
								<CardContent className="py-6">
									<p className="text-sm text-muted-foreground">{t('noCompetitorsTracked')}</p>
								</CardContent>
							</Card>
						) : null}

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('heatmap.title')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('heatmap.hint')}</p>
							</CardHeader>
							<CardContent className="overflow-x-auto">
								{heatmap.rows.length === 0 ? (
									<EmptyState title={t('heatmap.empty')} description={t('heatmap.emptyHint')} />
								) : (
									<table className="min-w-full text-xs">
										<thead>
											<tr>
												<th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium uppercase tracking-wide text-muted-foreground">
													{t('heatmap.keyword')}
												</th>
												{heatmap.columns.map((col) => (
													<th
														key={col.domain}
														className="px-3 py-2 text-left font-medium uppercase tracking-wide text-muted-foreground"
													>
														<div className="flex flex-col gap-0.5">
															<span className="break-all">{col.domain}</span>
															{col.isOwn ? <Badge variant="default">{t('heatmap.you')}</Badge> : null}
														</div>
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{heatmap.rows.map((row) => (
												<tr key={row.keyword} className="border-t border-border">
													<td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">{row.keyword}</td>
													{heatmap.columns.map((col) => {
														const cell = row.cells.get(col.domain);
														return (
															<td key={col.domain} className="px-1 py-1">
																<span
																	className={`inline-flex h-7 min-w-9 items-center justify-center rounded font-mono text-xs ${positionColor(
																		cell?.position ?? null,
																	)}`}
																	title={
																		cell?.position
																			? `${col.domain} · #${cell.position}${cell.url ? ` · ${cell.url}` : ''}`
																			: t('heatmap.notRanked')
																	}
																>
																	{cell?.position ?? '—'}
																</span>
															</td>
														);
													})}
												</tr>
											))}
										</tbody>
									</table>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('visibility.title')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('visibility.hint')}</p>
							</CardHeader>
							<CardContent>
								{visibilitySorted.length === 0 ? (
									<p className="text-sm text-muted-foreground">{t('visibility.empty')}</p>
								) : (
									<ul className="flex flex-col gap-2">
										{visibilitySorted.map((v, idx) => {
											const max = visibilitySorted[0]?.score ?? 1;
											const pct = max === 0 ? 0 : (v.score / max) * 100;
											return (
												<li key={v.domain} className="flex flex-col gap-1">
													<div className="flex items-center justify-between gap-2 text-sm">
														<span className="flex items-center gap-2">
															<span className="text-xs text-muted-foreground">#{idx + 1}</span>
															<span
																className={`break-all ${v.isOwn ? 'font-semibold text-primary' : 'font-medium'}`}
															>
																{v.domain}
															</span>
															{v.isOwn ? <Badge variant="default">{t('heatmap.you')}</Badge> : null}
														</span>
														<span className="tabular-nums text-xs">{v.score.toFixed(2)}</span>
													</div>
													<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
														<div
															className={v.isOwn ? 'h-full bg-primary' : 'h-full bg-amber-500'}
															style={{ width: `${pct}%` }}
														/>
													</div>
												</li>
											);
										})}
									</ul>
								)}
							</CardContent>
						</Card>

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<MovementCard
								title={t('winners.title')}
								empty={t('winners.empty')}
								rows={movement.winners.map((w) => ({
									keyword: w.keyword,
									ourLabel: `#${w.ownPos}`,
									theirLabel: w.bestCompetitor ? `${w.bestCompetitor.domain} #${w.bestCompetitor.pos}` : '',
									positive: true,
								}))}
							/>
							<MovementCard
								title={t('losers.title')}
								empty={t('losers.empty')}
								rows={movement.losers.map((w) => ({
									keyword: w.keyword,
									ourLabel: `#${w.ownPos}`,
									theirLabel: w.worstCompetitor
										? `${w.worstCompetitor.domain} #${w.worstCompetitor.pos}`
										: '',
									positive: false,
								}))}
							/>
						</div>

						{suggestions.length > 0 ? (
							<Card>
								<CardHeader>
									<CardTitle className="text-base">{t('suggestions.title')}</CardTitle>
									<p className="text-xs text-muted-foreground">{t('suggestions.hint')}</p>
								</CardHeader>
								<CardContent>
									<ul className="flex flex-col gap-2 text-sm">
										{suggestions.map((s) => (
											<li
												key={s.id}
												className="flex flex-col gap-2 rounded border border-border p-2 sm:flex-row sm:items-center sm:justify-between"
											>
												<div>
													<p className="font-medium">{s.domain}</p>
													<p className="text-xs text-muted-foreground">
														{t('suggestions.kwCount', {
															kw: s.distinctKeywordsInTop10,
															hits: s.totalTop10Hits,
														})}
													</p>
												</div>
												<Button
													size="sm"
													onClick={() => promoteSuggestion.mutate(s.id)}
													disabled={promoteSuggestion.isPending}
												>
													{t('suggestions.promote')}
												</Button>
											</li>
										))}
									</ul>
								</CardContent>
							</Card>
						) : null}
					</>
				)}
			</div>

			<AddCompetitorDrawer projectId={projectId} open={addOpen} onClose={() => setAddOpen(false)} />
		</AppShell>
	);
};

const MovementCard = ({
	title,
	empty,
	rows,
}: {
	title: string;
	empty: string;
	rows: { keyword: string; ourLabel: string; theirLabel: string; positive: boolean }[];
}) => (
	<Card>
		<CardHeader>
			<CardTitle className="text-base">{title}</CardTitle>
		</CardHeader>
		<CardContent>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{empty}</p>
			) : (
				<ul className="flex flex-col gap-2 text-sm">
					{rows.map((row) => (
						<li key={row.keyword} className="flex flex-col gap-0.5">
							<span className="font-medium">{row.keyword}</span>
							<span className="text-xs text-muted-foreground">
								{row.positive ? '✓' : '⚠'} {row.ourLabel} vs {row.theirLabel}
							</span>
						</li>
					))}
				</ul>
			)}
		</CardContent>
	</Card>
);
