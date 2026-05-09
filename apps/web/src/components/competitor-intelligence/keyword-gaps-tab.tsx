import type { CompetitorIntelligenceContracts } from '@rankpulse/contracts';
import type { CompetitorListItem } from '@rankpulse/sdk';
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
	Input,
	Label,
	Select,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Map as MapIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';

type GapEntry = CompetitorIntelligenceContracts.KeywordGapsResponseEntry;

const formatNumber = (n: number | null): string => {
	if (n === null) return '—';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
};

const formatPosition = (p: number | null): string => (p === null ? '—' : `#${p}`);
const formatCpc = (cpc: number | null): string => (cpc === null ? '—' : `$${cpc.toFixed(2)}`);
const formatRoi = (roi: number | null): string => {
	if (roi === null) return '—';
	if (roi >= 1_000_000) return `${(roi / 1_000_000).toFixed(1)}M`;
	if (roi >= 1_000) return `${(roi / 1_000).toFixed(1)}k`;
	return roi.toFixed(0);
};

interface KeywordGapsTabProps {
	projectId: string;
	ourDomain: string;
	competitors: readonly CompetitorListItem[];
}

export const KeywordGapsTab = ({ projectId, ourDomain, competitors }: KeywordGapsTabProps) => {
	const { t } = useTranslation('competitorIntelligence');

	const [competitorDomain, setCompetitorDomain] = useState<string>('');
	const [minVolume, setMinVolume] = useState<string>('');

	const effectiveCompetitorDomain = competitorDomain || competitors[0]?.domain || '';

	const gapsQuery = useQuery({
		queryKey: [
			'competitor-intelligence',
			projectId,
			'keyword-gaps',
			ourDomain,
			effectiveCompetitorDomain,
			minVolume,
		],
		queryFn: () =>
			api.competitorIntelligence.getKeywordGaps(projectId, {
				ourDomain,
				competitorDomain: effectiveCompetitorDomain,
				limit: 100,
				minVolume: minVolume === '' ? undefined : Number(minVolume),
			}),
		enabled: Boolean(ourDomain) && Boolean(effectiveCompetitorDomain),
		staleTime: 60_000,
	});

	// API already sorts by ROI desc, but sort defensively in case the response
	// shape changes — keeps the contract of "ROI score DESC" local to this tab.
	const rows = useMemo(() => {
		const list = [...(gapsQuery.data?.rows ?? [])];
		list.sort((a, b) => (b.roiScore ?? 0) - (a.roiScore ?? 0));
		return list;
	}, [gapsQuery.data]);

	const columns: DataTableColumn<GapEntry>[] = [
		{
			key: 'keyword',
			header: t('keywordGaps.keyword'),
			cell: (row) => (
				<a
					href={`https://www.google.com/search?q=${encodeURIComponent(row.keyword)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 break-words font-medium hover:text-primary"
				>
					{row.keyword}
					<ExternalLink size={11} />
				</a>
			),
		},
		{
			key: 'volume',
			header: t('keywordGaps.volume'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.searchVolume)}</span>,
		},
		{
			key: 'cpc',
			header: t('keywordGaps.cpc'),
			cell: (row) => <span className="font-mono text-sm">{formatCpc(row.cpc)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'kd',
			header: t('keywordGaps.difficulty'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.keywordDifficulty)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'theirPosition',
			header: t('keywordGaps.theirPosition'),
			cell: (row) => <Badge variant="warning">{formatPosition(row.theirPosition)}</Badge>,
		},
		{
			key: 'ourPosition',
			header: t('keywordGaps.ourPosition'),
			cell: (row) =>
				row.ourPosition === null ? (
					<Badge variant="secondary">{t('keywordGaps.notRanking')}</Badge>
				) : (
					<Badge variant="success">{formatPosition(row.ourPosition)}</Badge>
				),
		},
		{
			key: 'roiScore',
			header: t('keywordGaps.roi'),
			cell: (row) => <span className="font-mono text-sm font-semibold">{formatRoi(row.roiScore)}</span>,
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t('keywordGaps.title')}</CardTitle>
					<p className="text-xs text-muted-foreground">{t('keywordGaps.subtitle')}</p>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1">
							<Label htmlFor="kg-competitor">{t('filters.competitor')}</Label>
							<Select
								id="kg-competitor"
								value={effectiveCompetitorDomain}
								onChange={(e) => setCompetitorDomain(e.target.value)}
								className="min-h-11"
							>
								{competitors.map((c) => (
									<option key={c.id} value={c.domain}>
										{c.label} ({c.domain})
									</option>
								))}
							</Select>
						</div>
						<div className="flex flex-col gap-1">
							<Label htmlFor="kg-min-volume">{t('filters.minVolume')}</Label>
							<Input
								id="kg-min-volume"
								type="number"
								min={0}
								value={minVolume}
								onChange={(e) => setMinVolume(e.target.value)}
								placeholder="0"
								className="min-h-11"
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{gapsQuery.isLoading ? (
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			) : gapsQuery.isError ? (
				<EmptyState
					icon={<MapIcon size={32} />}
					title={t('errorTitle')}
					description={(gapsQuery.error as Error | undefined)?.message ?? ''}
					action={
						<Button onClick={() => gapsQuery.refetch()} className="min-h-11 min-w-11">
							{t('retry')}
						</Button>
					}
				/>
			) : rows.length === 0 ? (
				<EmptyState
					icon={<MapIcon size={32} />}
					title={t('keywordGaps.empty')}
					description={t('keywordGaps.emptyDescription')}
				/>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('keywordGaps.title')}</CardTitle>
						<p className="text-xs text-muted-foreground">{t('keywordGaps.tableHint')}</p>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<DataTable
								columns={columns}
								rows={rows}
								rowKey={(row) => `${row.keyword}-${row.observedAt}`}
								empty={t('keywordGaps.empty')}
							/>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
};
