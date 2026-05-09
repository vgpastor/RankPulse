import type { RankTrackingContracts } from '@rankpulse/contracts';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	EmptyState,
	Input,
	Spinner,
} from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Filter, Map as MapIcon, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type Classification = 'all' | 'own' | 'competitor' | 'other';

const classificationBadge = (
	c: RankTrackingContracts.SerpResultClassification,
): { variant: 'default' | 'warning' | 'secondary'; label: string; dot: string } => {
	if (c === 'own') return { variant: 'default', label: 'own', dot: 'bg-emerald-500' };
	if (c === 'competitor') return { variant: 'warning', label: 'competitor', dot: 'bg-red-500' };
	return { variant: 'secondary', label: 'other', dot: 'bg-slate-400' };
};

export const SerpMapPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/serp-map' });
	const { t } = useTranslation(['serpMap', 'common', 'rankings', 'competitors']);
	const qc = useQueryClient();
	const [classificationFilter, setClassificationFilter] = useState<Classification>('all');
	const [keywordFilter, setKeywordFilter] = useState('');
	const [competitorFilter, setCompetitorFilter] = useState<string | null>(null);

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

	const promoteMutation = useMutation({
		mutationFn: (input: { domain: string; label?: string }) =>
			api.projects.addCompetitor(projectId, { domain: input.domain, label: input.label }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'serp-map'] });
			qc.invalidateQueries({ queryKey: ['project', projectId, 'serp-map-suggestions'] });
			qc.invalidateQueries({ queryKey: ['project', projectId, 'competitors'] });
		},
	});

	const rows = serpMapQuery.data?.rows ?? [];
	const suggestions = suggestionsQuery.data?.suggestions ?? [];

	const competitorOptions = useMemo(() => {
		const set = new Map<string, string>();
		for (const row of rows) {
			for (const r of row.results) {
				if (r.classification === 'competitor' && r.competitorLabel) {
					set.set(r.domain, r.competitorLabel);
				}
			}
		}
		return [...set.entries()].sort(([, a], [, b]) => a.localeCompare(b));
	}, [rows]);

	const filteredRows = useMemo(() => {
		const kw = keywordFilter.trim().toLowerCase();
		return rows
			.filter((row) => (kw ? row.phrase.toLowerCase().includes(kw) : true))
			.map((row) => {
				let results = row.results;
				if (classificationFilter !== 'all') {
					results = results.filter((r) => r.classification === classificationFilter);
				}
				if (competitorFilter) {
					// Keep only rows that contain this competitor at any rank, then
					// surface it visually — easier than collapsing the row.
					if (!row.results.some((r) => r.domain === competitorFilter)) return null;
				}
				return { ...row, results };
			})
			.filter((row): row is NonNullable<typeof row> => row !== null);
	}, [rows, keywordFilter, classificationFilter, competitorFilter]);

	if (projectQuery.isLoading || serpMapQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const project = projectQuery.data;

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<Link
							to="/projects/$id/rankings"
							params={{ id: projectId }}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<ArrowLeft size={12} />
							{t('serpMap:backToRankings')}
						</Link>
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<MapIcon size={20} className="text-primary" />
							{t('serpMap:title')}
						</h1>
						<p className="text-sm text-muted-foreground">
							{project?.name} · {t('serpMap:subtitle')}
						</p>
					</div>
				</header>

				{rows.length === 0 ? (
					<EmptyState
						icon={<MapIcon size={32} />}
						title={t('serpMap:empty.title')}
						description={t('serpMap:empty.description')}
					/>
				) : (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Filter size={14} />
									{t('serpMap:filtersTitle')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
									<div className="flex-1">
										<label
											htmlFor="serp-map-keyword-filter"
											className="block text-xs font-medium text-muted-foreground"
										>
											{t('serpMap:filterByKeyword')}
										</label>
										<div className="relative">
											<Search
												size={14}
												className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
												aria-hidden
											/>
											<Input
												id="serp-map-keyword-filter"
												className="pl-7"
												value={keywordFilter}
												onChange={(e) => setKeywordFilter(e.target.value)}
												placeholder={t('serpMap:filterKeywordPlaceholder')}
											/>
										</div>
									</div>
									<fieldset className="flex flex-col gap-1 border-0 p-0">
										<legend className="block text-xs font-medium text-muted-foreground">
											{t('serpMap:filterByClassification')}
										</legend>
										<div className="flex flex-wrap gap-1">
											{(['all', 'own', 'competitor', 'other'] as Classification[]).map((c) => (
												<Button
													key={c}
													size="sm"
													type="button"
													variant={classificationFilter === c ? 'primary' : 'secondary'}
													onClick={() => setClassificationFilter(c)}
													aria-pressed={classificationFilter === c}
												>
													{t(`serpMap:classification.${c}`)}
												</Button>
											))}
										</div>
									</fieldset>
									{competitorOptions.length > 0 ? (
										<div>
											<label
												htmlFor="serp-map-competitor-filter"
												className="block text-xs font-medium text-muted-foreground"
											>
												{t('serpMap:filterByCompetitor')}
											</label>
											<select
												id="serp-map-competitor-filter"
												value={competitorFilter ?? ''}
												onChange={(e) => setCompetitorFilter(e.target.value || null)}
												className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
											>
												<option value="">{t('serpMap:filterAllCompetitors')}</option>
												{competitorOptions.map(([domain, label]) => (
													<option key={domain} value={domain}>
														{label} ({domain})
													</option>
												))}
											</select>
										</div>
									) : null}
								</div>
							</CardContent>
						</Card>

						<section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							{filteredRows.map((row) => (
								<SerpMapCard key={`${row.phrase}-${row.country}-${row.language}-${row.device}`} row={row} />
							))}
							{filteredRows.length === 0 ? (
								<Card>
									<CardContent className="py-8 text-center text-sm text-muted-foreground">
										{t('serpMap:noMatch')}
									</CardContent>
								</Card>
							) : null}
						</section>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('serpMap:suggestions.title')}</CardTitle>
								<p className="text-xs text-muted-foreground">{t('serpMap:suggestions.hint')}</p>
							</CardHeader>
							<CardContent>
								{suggestionsQuery.isLoading ? (
									<Spinner />
								) : suggestions.length === 0 ? (
									<p className="text-sm text-muted-foreground">{t('serpMap:suggestions.empty')}</p>
								) : (
									<ul className="flex flex-col gap-2">
										{suggestions.map((s) => (
											<li
												key={s.domain}
												className="flex flex-col gap-2 rounded border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
											>
												<div className="flex flex-col gap-0.5">
													<span className="font-medium">{s.domain}</span>
													<span className="text-xs text-muted-foreground">
														{t('serpMap:suggestions.kwCount', {
															kw: s.distinctKeywords,
															hits: s.totalAppearances,
														})}{' '}
														· {t('serpMap:suggestions.bestRank', { rank: s.bestRank })}
													</span>
													{s.sampleUrl ? (
														<a
															href={s.sampleUrl}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
														>
															<ExternalLink size={11} />
															{s.sampleUrl}
														</a>
													) : null}
												</div>
												<Button
													size="sm"
													onClick={() => promoteMutation.mutate({ domain: s.domain })}
													disabled={promoteMutation.isPending}
												>
													<Plus size={14} />
													{t('serpMap:suggestions.add')}
												</Button>
											</li>
										))}
									</ul>
								)}
							</CardContent>
						</Card>
					</>
				)}
			</div>
		</AppShell>
	);
};

const SerpMapCard = ({ row }: { row: RankTrackingContracts.SerpMapRowDto }) => {
	const { t } = useTranslation(['serpMap', 'rankings', 'common']);
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex flex-col gap-1">
					<CardTitle className="break-words text-base">{row.phrase}</CardTitle>
					<div className="flex flex-wrap items-center gap-1.5 text-xs">
						<Badge variant="secondary">
							{row.country} · {row.language}
						</Badge>
						<Badge variant={row.device === 'desktop' ? 'default' : 'warning'}>{row.device}</Badge>
						<span className="text-muted-foreground">
							{t('serpMap:asOf')} {new Date(row.observedAt).toLocaleDateString()}
						</span>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{row.results.length === 0 ? (
					<p className="text-xs text-muted-foreground">{t('serpMap:noResultsForFilter')}</p>
				) : (
					<ol className="flex flex-col gap-1">
						{row.results.map((r) => {
							const badge = classificationBadge(r.classification);
							const display = r.competitorLabel ?? r.domain;
							return (
								<li
									key={`${r.rank}-${r.domain}`}
									className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40"
								>
									<span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
										#{r.rank}
									</span>
									<span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${badge.dot}`} />
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5">
											<span
												className={`truncate text-sm ${r.classification === 'own' ? 'font-semibold text-primary' : 'font-medium'}`}
											>
												{display}
											</span>
											<Badge variant={badge.variant}>{t(`serpMap:classification.${r.classification}`)}</Badge>
										</div>
										{r.title ? (
											<p className="truncate text-xs text-muted-foreground" title={r.title}>
												{r.title}
											</p>
										) : null}
									</div>
									{r.url ? (
										<a
											href={r.url}
											target="_blank"
											rel="noopener noreferrer"
											className="shrink-0 text-muted-foreground hover:text-foreground"
											aria-label={t('serpMap:openUrl')}
										>
											<ExternalLink size={14} />
										</a>
									) : null}
								</li>
							);
						})}
					</ol>
				)}
			</CardContent>
		</Card>
	);
};
