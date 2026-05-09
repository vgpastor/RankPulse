import type { CompetitorIntelligenceContracts } from '@rankpulse/contracts';
import {
	Badge,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	type DataTableColumn,
	EmptyState,
	Input,
	KpiCard,
	Label,
	Select,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Map as MapIcon, Target } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

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

export const ContentGapPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/content-gap' });
	const { t } = useTranslation(['cockpit', 'common']);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const competitorsQuery = useQuery({
		queryKey: ['project', projectId, 'competitors'],
		queryFn: () => api.projects.listCompetitors(projectId),
	});

	const project = projectQuery.data;
	const competitors = competitorsQuery.data ?? [];

	const [ourDomain, setOurDomain] = useState<string>('');
	const [competitorDomain, setCompetitorDomain] = useState<string>('');
	const [minVolume, setMinVolume] = useState<string>('');

	const effectiveOurDomain = ourDomain || project?.primaryDomain || '';
	const effectiveCompetitorDomain = competitorDomain || competitors[0]?.domain || '';

	const gapsQuery = useQuery({
		queryKey: [
			'project',
			projectId,
			'keyword-gaps',
			effectiveOurDomain,
			effectiveCompetitorDomain,
			minVolume,
		],
		queryFn: () =>
			api.competitorIntelligence.getKeywordGaps(projectId, {
				ourDomain: effectiveOurDomain,
				competitorDomain: effectiveCompetitorDomain,
				limit: 100,
				minVolume: minVolume === '' ? undefined : Number(minVolume),
			}),
		enabled: Boolean(effectiveOurDomain) && Boolean(effectiveCompetitorDomain),
	});

	const rows = gapsQuery.data?.rows ?? [];
	const totalVolume = rows.reduce((acc, r) => acc + (r.searchVolume ?? 0), 0);
	const totalRoi = rows.reduce((acc, r) => acc + (r.roiScore ?? 0), 0);

	const columns: DataTableColumn<GapEntry>[] = [
		{
			key: 'keyword',
			header: t('cockpit:contentGapPage.keyword'),
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
			header: t('cockpit:contentGapPage.volume'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.searchVolume)}</span>,
		},
		{
			key: 'cpc',
			header: t('cockpit:contentGapPage.cpc'),
			cell: (row) => <span className="font-mono text-sm">{formatCpc(row.cpc)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'kd',
			header: t('cockpit:contentGapPage.difficulty'),
			cell: (row) => <span className="font-mono text-sm">{formatNumber(row.keywordDifficulty)}</span>,
			hideOnMobile: true,
		},
		{
			key: 'theirPosition',
			header: t('cockpit:contentGapPage.theirPosition'),
			cell: (row) => <Badge variant="warning">{formatPosition(row.theirPosition)}</Badge>,
		},
		{
			key: 'ourPosition',
			header: t('cockpit:contentGapPage.ourPosition'),
			cell: (row) =>
				row.ourPosition === null ? (
					<Badge variant="secondary">{t('cockpit:contentGapPage.notRanking')}</Badge>
				) : (
					<Badge variant="success">{formatPosition(row.ourPosition)}</Badge>
				),
		},
		{
			key: 'roiScore',
			header: t('cockpit:contentGapPage.roi'),
			cell: (row) => <span className="font-mono text-sm font-semibold">{formatRoi(row.roiScore)}</span>,
		},
	];

	if (projectQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const hasCompetitors = competitors.length > 0;
	const ourDomainOptions = project ? [project.primaryDomain, ...project.domains.map((d) => d.domain)] : [];
	const uniqueOurDomains = [...new Set(ourDomainOptions)];

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header>
					<Link
						to="/projects/$id/cockpit"
						params={{ id: projectId }}
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft size={12} />
						{t('cockpit:backToCockpit')}
					</Link>
					<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
						<MapIcon size={20} className="text-cyan-600" />
						{t('cockpit:contentGapPage.title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name} · {t('cockpit:contentGapPage.subtitle')}
					</p>
				</header>

				{!hasCompetitors ? (
					<EmptyState
						icon={<Target size={32} />}
						title={t('cockpit:contentGapPage.noCompetitors')}
						description={t('cockpit:contentGapPage.noCompetitorsDescription')}
					/>
				) : (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('cockpit:contentGapPage.filtersTitle')}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
									<div className="flex flex-col gap-1">
										<Label htmlFor="ourDomain">{t('cockpit:contentGapPage.ourDomain')}</Label>
										<Select
											id="ourDomain"
											value={effectiveOurDomain}
											onChange={(e) => setOurDomain(e.target.value)}
										>
											{uniqueOurDomains.map((d) => (
												<option key={d} value={d}>
													{d}
												</option>
											))}
										</Select>
									</div>
									<div className="flex flex-col gap-1">
										<Label htmlFor="competitorDomain">{t('cockpit:contentGapPage.competitorDomain')}</Label>
										<Select
											id="competitorDomain"
											value={effectiveCompetitorDomain}
											onChange={(e) => setCompetitorDomain(e.target.value)}
										>
											{competitors.map((c) => (
												<option key={c.id} value={c.domain}>
													{c.label} ({c.domain})
												</option>
											))}
										</Select>
									</div>
									<div className="flex flex-col gap-1">
										<Label htmlFor="minVolume">{t('cockpit:contentGapPage.minVolume')}</Label>
										<Input
											id="minVolume"
											type="number"
											min={0}
											value={minVolume}
											onChange={(e) => setMinVolume(e.target.value)}
											placeholder="0"
										/>
									</div>
								</div>
							</CardContent>
						</Card>

						<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
							<KpiCard
								label={t('cockpit:contentGapPage.kpi.gaps')}
								value={rows.length.toString()}
								hint={t('cockpit:contentGapPage.kpi.gapsHint')}
							/>
							<KpiCard
								label={t('cockpit:contentGapPage.kpi.totalVolume')}
								value={formatNumber(totalVolume)}
								hint={t('cockpit:contentGapPage.kpi.totalVolumeHint')}
							/>
							<KpiCard
								label={t('cockpit:contentGapPage.kpi.totalRoi')}
								value={formatRoi(totalRoi)}
								hint={t('cockpit:contentGapPage.kpi.totalRoiHint')}
							/>
						</div>

						{gapsQuery.isLoading ? (
							<div className="flex justify-center py-10">
								<Spinner size="lg" />
							</div>
						) : rows.length === 0 ? (
							<EmptyState
								icon={<MapIcon size={32} />}
								title={t('cockpit:contentGapPage.empty')}
								description={t('cockpit:contentGapPage.emptyDescription')}
							/>
						) : (
							<Card>
								<CardHeader>
									<CardTitle className="text-base">{t('cockpit:contentGapPage.tableTitle')}</CardTitle>
									<p className="text-xs text-muted-foreground">{t('cockpit:contentGapPage.tableHint')}</p>
								</CardHeader>
								<CardContent>
									<DataTable
										columns={columns}
										rows={rows}
										rowKey={(row) => `${row.keyword}-${row.observedAt}`}
										empty={t('cockpit:contentGapPage.empty')}
									/>
								</CardContent>
							</Card>
						)}
					</>
				)}
			</div>
		</AppShell>
	);
};
