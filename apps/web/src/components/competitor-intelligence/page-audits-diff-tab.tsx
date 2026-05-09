import type { CompetitorIntelligenceContracts } from '@rankpulse/contracts';
import type { CompetitorListItem } from '@rankpulse/sdk';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	EmptyState,
	Label,
	Select,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileSearch, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';

type AuditDto = CompetitorIntelligenceContracts.CompetitorPageAuditDto;

interface PageAuditsDiffTabProps {
	projectId: string;
	competitors: readonly CompetitorListItem[];
}

const formatBool = (b: boolean | null): string => (b === null ? '—' : b ? '✓' : '✗');
const formatInt = (n: number | null): string => (n === null ? '—' : n.toLocaleString());
const formatMs = (n: number | null): string => (n === null ? '—' : `${n.toLocaleString()} ms`);
const formatCls = (n: number | null): string => (n === null ? '—' : n.toFixed(3));

export const PageAuditsDiffTab = ({ projectId, competitors }: PageAuditsDiffTabProps) => {
	const { t } = useTranslation('competitorIntelligence');
	const [competitorDomain, setCompetitorDomain] = useState<string>('');
	const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

	const effectiveCompetitorDomain = competitorDomain || competitors[0]?.domain || '';

	// 1) List query: all latest competitor audits for the picked domain. We do
	//    NOT pass `url` so the backend returns the latest snapshot per URL.
	const listQuery = useQuery({
		queryKey: ['competitor-intelligence', projectId, 'page-audits', effectiveCompetitorDomain, 'list'],
		queryFn: () =>
			api.competitorIntelligence.getCompetitorPageAudits(projectId, {
				competitorDomain: effectiveCompetitorDomain,
				limit: 200,
			}),
		enabled: Boolean(effectiveCompetitorDomain),
		staleTime: 60_000,
	});

	const audits: AuditDto[] = useMemo(() => listQuery.data?.rows ?? [], [listQuery.data]);
	const selectedAudit = useMemo(
		() => audits.find((a) => a.url === selectedUrl) ?? null,
		[audits, selectedUrl],
	);

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t('pageAuditsDiff.title')}</CardTitle>
					<p className="text-xs text-muted-foreground">{t('pageAuditsDiff.subtitle')}</p>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-1 sm:max-w-xs">
						<Label htmlFor="pad-competitor">{t('filters.competitor')}</Label>
						<Select
							id="pad-competitor"
							value={effectiveCompetitorDomain}
							onChange={(e) => {
								setCompetitorDomain(e.target.value);
								setSelectedUrl(null);
							}}
							className="min-h-11"
						>
							{competitors.map((c) => (
								<option key={c.id} value={c.domain}>
									{c.label} ({c.domain})
								</option>
							))}
						</Select>
					</div>
				</CardContent>
			</Card>

			{listQuery.isLoading ? (
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			) : listQuery.isError ? (
				<EmptyState
					icon={<FileSearch size={32} />}
					title={t('errorTitle')}
					description={(listQuery.error as Error | undefined)?.message ?? ''}
					action={
						<Button onClick={() => listQuery.refetch()} className="min-h-11 min-w-11">
							{t('retry')}
						</Button>
					}
				/>
			) : audits.length === 0 ? (
				<EmptyState
					icon={<FileSearch size={32} />}
					title={t('pageAuditsDiff.empty')}
					description={t('pageAuditsDiff.emptyDescription')}
				/>
			) : (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_1fr]">
					{/* URL list (left rail) */}
					<Card className="lg:max-h-[600px] lg:overflow-y-auto">
						<CardHeader>
							<CardTitle className="text-sm">{t('pageAuditsDiff.pickUrl')}</CardTitle>
							<p className="text-xs text-muted-foreground">{t('pageAuditsDiff.pickUrlHint')}</p>
						</CardHeader>
						<CardContent>
							<ul className="flex flex-col gap-1">
								{audits.map((a) => {
									const isActive = a.url === selectedUrl;
									return (
										<li key={a.url}>
											<button
												type="button"
												onClick={() => setSelectedUrl(a.url)}
												className={`w-full break-all rounded border px-2 py-2 text-left text-xs transition-colors min-h-11 ${
													isActive
														? 'border-primary bg-primary/10 text-foreground'
														: 'border-border hover:bg-muted/30'
												}`}
												aria-pressed={isActive}
											>
												{a.url}
											</button>
										</li>
									);
								})}
							</ul>
						</CardContent>
					</Card>

					{/* OUR side — placeholder per #132 brief: own-URL audits not implemented. */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-sm">
								<Lock size={14} />
								{t('pageAuditsDiff.ourSideTitle')}
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<p className="text-sm text-muted-foreground">{t('pageAuditsDiff.ourSidePlaceholder')}</p>
							<Button variant="secondary" disabled className="self-start min-h-11 min-w-11">
								{t('pageAuditsDiff.ourSideCta')}
							</Button>
						</CardContent>
					</Card>

					{/* Competitor side */}
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">{t('pageAuditsDiff.competitorSideTitle')}</CardTitle>
						</CardHeader>
						<CardContent>
							{selectedAudit === null ? (
								<p className="text-sm text-muted-foreground">{t('pageAuditsDiff.selectPrompt')}</p>
							) : (
								<AuditDetail audit={selectedAudit} />
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
};

const AuditDetail = ({ audit }: { audit: AuditDto }) => {
	const { t } = useTranslation('competitorIntelligence');

	const canonicalDiffers =
		audit.canonicalUrl !== null && audit.canonicalUrl.replace(/\/$/, '') !== audit.url.replace(/\/$/, '');

	return (
		<div className="flex flex-col gap-4 text-sm">
			<a
				href={audit.url}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 break-all text-xs font-medium hover:text-primary"
			>
				{audit.url}
				<ExternalLink size={11} />
			</a>
			<p className="text-xs text-muted-foreground">
				{t('pageAuditsDiff.fetchedAt')}: {new Date(audit.observedAt).toLocaleString()}
			</p>

			<section className="flex flex-col gap-2">
				<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t('pageAuditsDiff.groupSeoBasics')}
				</h4>
				<KV label={t('pageAuditsDiff.statusCode')} value={formatInt(audit.statusCode)} />
				<KV label={t('pageAuditsDiff.pageTitle')} value={audit.title ?? '—'} />
				<KV label={t('pageAuditsDiff.metaDescription')} value={audit.metaDescription ?? '—'} />
				<KV label={t('pageAuditsDiff.h1')} value={audit.h1 ?? '—'} />
				{canonicalDiffers ? (
					<KV label={t('pageAuditsDiff.canonicalUrl')} value={audit.canonicalUrl ?? '—'} />
				) : null}
			</section>

			<section className="flex flex-col gap-2">
				<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t('pageAuditsDiff.groupOnPage')}
				</h4>
				<KV label={t('pageAuditsDiff.h2Count')} value={formatInt(audit.h2Count)} />
				<KV label={t('pageAuditsDiff.wordCount')} value={formatInt(audit.wordCount)} />
				<KV label={t('pageAuditsDiff.internalLinks')} value={formatInt(audit.internalLinksCount)} />
				<KV label={t('pageAuditsDiff.externalLinks')} value={formatInt(audit.externalLinksCount)} />
			</section>

			<section className="flex flex-col gap-2">
				<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t('pageAuditsDiff.groupPerformance')}
				</h4>
				<KV label={t('pageAuditsDiff.lcp')} value={formatMs(audit.lcpMs)} />
				<KV label={t('pageAuditsDiff.cls')} value={formatCls(audit.cls)} />
				<KV label={t('pageAuditsDiff.ttfb')} value={formatMs(audit.ttfbMs)} />
				<KV label={t('pageAuditsDiff.domSize')} value={formatInt(audit.domSize)} />
			</section>

			<section className="flex flex-col gap-2">
				<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t('pageAuditsDiff.groupStructured')}
				</h4>
				<KV label={t('pageAuditsDiff.hasSchema')} value={formatBool(audit.hasSchemaOrg)} />
				<div className="flex flex-col gap-1">
					<span className="text-xs text-muted-foreground">{t('pageAuditsDiff.schemaTypes')}</span>
					<div className="flex flex-wrap gap-1">
						{audit.schemaTypes.length === 0 ? (
							<span className="text-xs">—</span>
						) : (
							audit.schemaTypes.map((s) => (
								<Badge key={s} variant="secondary">
									{s}
								</Badge>
							))
						)}
					</div>
				</div>
			</section>
		</div>
	);
};

const KV = ({ label, value }: { label: string; value: string }) => (
	<div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
		<dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground sm:w-32">{label}</dt>
		<dd className="break-words text-xs">{value}</dd>
	</div>
);
