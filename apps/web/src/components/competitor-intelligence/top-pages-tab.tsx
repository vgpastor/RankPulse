import type { CompetitorListItem } from '@rankpulse/sdk';
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	type DataTableColumn,
	EmptyState,
	Label,
	Select,
	Spinner,
} from '@rankpulse/ui';
import { useQueries } from '@tanstack/react-query';
import { ExternalLink, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';

interface TopPagesTabProps {
	projectId: string;
	competitors: readonly CompetitorListItem[];
}

interface AggregatedRow {
	url: string;
	competitorDomain: string;
	competitorLabel: string;
	keywordsTop10: number;
	totalVolume: number;
	avgPosition: number;
	trafficEstimate: number;
}

const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
};

export const TopPagesTab = ({ projectId, competitors }: TopPagesTabProps) => {
	const { t } = useTranslation('competitorIntelligence');

	// `all` aggregates across every competitor; otherwise filter to one. Storing
	// the competitor domain (not the id) so the option value matches the
	// targetDomain we're querying.
	const [selected, setSelected] = useState<string>('all');

	// One query per competitor — react-query handles parallel fetches and
	// dedupes naturally. We can't fan out into a single backend call because
	// `getRankedKeywords` is per-targetDomain.
	const queries = useQueries({
		queries: competitors.map((c) => ({
			queryKey: ['competitor-intelligence', projectId, 'ranked-keywords', c.domain],
			queryFn: () => api.rankTracking.getRankedKeywords(projectId, { targetDomain: c.domain, limit: 1000 }),
			staleTime: 60_000,
		})),
	});

	const isLoading = queries.some((q) => q.isLoading);
	const isError = queries.some((q) => q.isError);
	const firstError = queries.find((q) => q.isError)?.error as Error | undefined;
	const refetchAll = () => {
		for (const q of queries) void q.refetch();
	};

	const aggregated: AggregatedRow[] = useMemo(() => {
		const buckets = new Map<string, AggregatedRow & { positionSum: number; positionCount: number }>();
		competitors.forEach((c, i) => {
			const data = queries[i]?.data;
			if (!data) return;
			for (const row of data.rows) {
				if (row.position === null || row.position > 10) continue;
				if (!row.rankingUrl) continue;
				const key = `${c.domain}::${row.rankingUrl}`;
				const cur = buckets.get(key) ?? {
					url: row.rankingUrl,
					competitorDomain: c.domain,
					competitorLabel: c.label,
					keywordsTop10: 0,
					totalVolume: 0,
					avgPosition: 0,
					trafficEstimate: 0,
					positionSum: 0,
					positionCount: 0,
				};
				cur.keywordsTop10 += 1;
				cur.totalVolume += row.searchVolume ?? 0;
				cur.trafficEstimate += row.trafficEstimate ?? 0;
				cur.positionSum += row.position;
				cur.positionCount += 1;
				buckets.set(key, cur);
			}
		});
		return [...buckets.values()].map((b) => ({
			url: b.url,
			competitorDomain: b.competitorDomain,
			competitorLabel: b.competitorLabel,
			keywordsTop10: b.keywordsTop10,
			totalVolume: b.totalVolume,
			avgPosition: b.positionCount === 0 ? 0 : b.positionSum / b.positionCount,
			trafficEstimate: b.trafficEstimate,
		}));
		// queries reference is stable per render but `data` is what matters.
		// Stringify the data fingerprint to avoid stale memos when one query
		// finishes after another. Length+last-update is enough.
	}, [
		competitors,
		queries.map((q) => q.dataUpdatedAt).join(','),
		queries.map((q) => q.data?.rows.length ?? 0).join(','),
	]);

	const filtered = useMemo(() => {
		const list = selected === 'all' ? aggregated : aggregated.filter((r) => r.competitorDomain === selected);
		list.sort((a, b) => b.trafficEstimate - a.trafficEstimate);
		return list;
	}, [aggregated, selected]);

	const columns: DataTableColumn<AggregatedRow>[] = [
		{
			key: 'url',
			header: t('topPages.url'),
			cell: (row) => (
				<a
					href={row.url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 break-all text-xs font-medium hover:text-primary"
				>
					{row.url}
					<ExternalLink size={11} />
				</a>
			),
		},
		{
			key: 'competitor',
			header: t('topPages.competitor'),
			cell: (row) => <span className="text-xs">{row.competitorLabel}</span>,
			hideOnMobile: true,
		},
		{
			key: 'keywordsTop10',
			header: t('topPages.keywordsTop10'),
			cell: (row) => <span className="font-mono text-sm">{row.keywordsTop10}</span>,
		},
		{
			key: 'totalVolume',
			header: t('topPages.totalVolume'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.totalVolume)}</span>,
		},
		{
			key: 'avgPosition',
			header: t('topPages.avgPosition'),
			cell: (row) => <span className="font-mono text-sm">{row.avgPosition.toFixed(1)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'trafficEstimate',
			header: t('topPages.trafficEstimate'),
			cell: (row) => (
				<span className="font-mono text-sm font-semibold">
					{formatNumber(Math.round(row.trafficEstimate))}
				</span>
			),
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t('topPages.title')}</CardTitle>
					<p className="text-xs text-muted-foreground">{t('topPages.subtitle')}</p>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-1 sm:max-w-xs">
						<Label htmlFor="tp-competitor">{t('filters.competitor')}</Label>
						<Select
							id="tp-competitor"
							value={selected}
							onChange={(e) => setSelected(e.target.value)}
							className="min-h-11"
						>
							<option value="all">{t('filters.competitorAll')}</option>
							{competitors.map((c) => (
								<option key={c.id} value={c.domain}>
									{c.label} ({c.domain})
								</option>
							))}
						</Select>
					</div>
				</CardContent>
			</Card>

			{isLoading ? (
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			) : isError ? (
				<EmptyState
					icon={<Layers size={32} />}
					title={t('errorTitle')}
					description={firstError?.message ?? ''}
					action={
						<Button onClick={refetchAll} className="min-h-11 min-w-11">
							{t('retry')}
						</Button>
					}
				/>
			) : filtered.length === 0 ? (
				<EmptyState
					icon={<Layers size={32} />}
					title={t('topPages.empty')}
					description={t('topPages.emptyDescription')}
				/>
			) : (
				<Card>
					<CardContent>
						<div className="overflow-x-auto">
							<DataTable
								columns={columns}
								rows={filtered}
								rowKey={(row) => `${row.competitorDomain}::${row.url}`}
								empty={t('topPages.empty')}
							/>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
};
