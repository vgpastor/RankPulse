import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type MatrixCell = AiSearchInsightsContracts.CompetitiveMatrixCell;

const formatPercent = (value: number): string => `${(value * 100).toFixed(0)}%`;

/**
 * Sub-issue #64 of #27 — competitive matrix heatmap. Pivots the flat
 * list returned by the API into rows = brand, columns = (provider, locale).
 * Cell colour reflects the mention rate (0% = empty, higher = more saturated).
 *
 * Cells where a brand has zero mentions in the API response are rendered
 * as empty 0% cells so the heatmap stays dense — no "this brand was missing
 * from this column" gap that confuses readers.
 */
export const AiSearchMatrixPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/ai-search/matrix' });

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const matrixQuery = useQuery({
		queryKey: ['project', projectId, 'ai-search', 'matrix'],
		queryFn: () => api.aiSearch.competitiveMatrix(projectId),
		staleTime: 5 * 60 * 1000,
	});

	const items = matrixQuery.data?.items ?? [];

	const { brands, columns, byCell } = useMemo(() => {
		const brandSet = new Map<string, { name: string; isOwn: boolean }>();
		const columnSet = new Set<string>();
		const map = new Map<string, MatrixCell>();
		for (const c of items) {
			const colKey = `${c.aiProvider}|${c.country}|${c.language}`;
			columnSet.add(colKey);
			if (!brandSet.has(c.brand)) brandSet.set(c.brand, { name: c.brand, isOwn: c.isOwnBrand });
			map.set(`${c.brand}|${colKey}`, c);
		}
		const brandsArr = [...brandSet.values()].sort((a, b) => {
			if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		const columnsArr = [...columnSet].sort();
		return { brands: brandsArr, columns: columnsArr, byCell: map };
	}, [items]);

	if (projectQuery.isLoading) {
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
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Sparkles size={20} className="text-primary" />
							AI competitive matrix
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} ·{' '}
							<Link to="/projects/$id/brand-prompts" params={{ id: projectId }} className="hover:underline">
								Back to prompts
							</Link>
						</p>
					</div>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Mention rate · {brands.length} brands × {columns.length} (provider × locale)
						</CardTitle>
					</CardHeader>
					<CardContent>
						{matrixQuery.isLoading ? (
							<Spinner />
						) : columns.length === 0 ? (
							<EmptyState
								title="No captures yet"
								description="Once BrandPrompt fan-outs land, the heatmap will fill in. Connect at least one LLM provider and add a prompt to start."
							/>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full border-collapse text-xs">
									<thead>
										<tr>
											<th className="sticky left-0 bg-card px-2 py-2 text-left font-medium">Brand</th>
											{columns.map((col) => {
												const [provider, country, language] = col.split('|') as [string, string, string];
												return (
													<th
														key={col}
														className="px-2 py-2 text-center font-medium whitespace-nowrap"
														title={`${provider} · ${country.toLowerCase()}-${language}`}
													>
														{provider}
														<br />
														<span className="text-muted-foreground">
															{country.toLowerCase()}-{language}
														</span>
													</th>
												);
											})}
										</tr>
									</thead>
									<tbody>
										{brands.map((brand) => (
											<tr key={brand.name}>
												<td
													className={`sticky left-0 bg-card px-2 py-2 ${brand.isOwn ? 'font-semibold' : ''}`}
												>
													{brand.name}
													{brand.isOwn ? <span className="ml-1 text-primary">(you)</span> : null}
												</td>
												{columns.map((col) => {
													const cell = byCell.get(`${brand.name}|${col}`);
													const rate = cell?.mentionRate ?? 0;
													const intensity = Math.min(rate, 1);
													const bg =
														rate === 0
															? undefined
															: brand.isOwn
																? `rgba(34, 197, 94, ${0.15 + intensity * 0.6})`
																: `rgba(239, 68, 68, ${0.15 + intensity * 0.5})`;
													return (
														<td
															key={col}
															className="px-2 py-2 text-center font-mono"
															style={{ backgroundColor: bg }}
															title={
																cell
																	? `${cell.answersWithMention}/${cell.totalAnswers} answers · avg pos ${
																			cell.avgPosition?.toFixed(1) ?? '—'
																		}`
																	: 'no mentions'
															}
														>
															{formatPercent(rate)}
														</td>
													);
												})}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
};
