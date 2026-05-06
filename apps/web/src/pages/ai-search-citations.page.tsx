import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	EmptyState,
	Select,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Globe2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

type ProviderFilter = AiSearchInsightsContracts.AiProviderNameContract | 'all';

const PROVIDER_OPTIONS: ReadonlyArray<{ value: ProviderFilter; label: string }> = [
	{ value: 'all', label: 'All providers' },
	{ value: 'openai', label: 'OpenAI' },
	{ value: 'anthropic', label: 'Anthropic' },
	{ value: 'perplexity', label: 'Perplexity' },
	{ value: 'google-ai-studio', label: 'Google AI Studio' },
];

/**
 * Sub-issue #63 of #27 — Citations history page. Defaults to "own domains
 * only" because the most actionable view is "what URL of mine is the LLM
 * citing". Toggle off to surface every URL the LLMs cited (useful for
 * competitive intel: which third-party reviews / comparison sites do they
 * lean on).
 */
export const AiSearchCitationsPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/ai-search/citations' });
	const [onlyOwn, setOnlyOwn] = useState(true);
	const [provider, setProvider] = useState<ProviderFilter>('all');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});

	const citationsQuery = useQuery({
		queryKey: ['project', projectId, 'ai-search', 'citations', onlyOwn, provider],
		queryFn: () =>
			api.aiSearch.citations(projectId, {
				onlyOwnDomains: onlyOwn,
				aiProvider: provider === 'all' ? undefined : provider,
			}),
		staleTime: 5 * 60 * 1000,
	});

	if (projectQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const items = citationsQuery.data?.items ?? [];

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Sparkles size={20} className="text-primary" />
							AI citations
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} ·{' '}
							<Link to="/projects/$id/brand-prompts" params={{ id: projectId }} className="hover:underline">
								Back to prompts
							</Link>
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant={onlyOwn ? 'primary' : 'secondary'} size="sm" onClick={() => setOnlyOwn(true)}>
							Own domains
						</Button>
						<Button variant={onlyOwn ? 'secondary' : 'primary'} size="sm" onClick={() => setOnlyOwn(false)}>
							All citations
						</Button>
						<Select
							value={provider}
							onChange={(e) => setProvider(e.target.value as ProviderFilter)}
							className="h-9"
						>
							{PROVIDER_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</Select>
					</div>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							{onlyOwn ? 'Cited URLs of your domains' : 'All cited URLs'} ({items.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						{citationsQuery.isLoading ? (
							<Spinner />
						) : (
							<DataTable
								rows={items}
								rowKey={(c) => c.url}
								empty={
									<EmptyState
										title="No citations in this window"
										description={
											onlyOwn
												? 'No URL of your project has been cited yet by the connected LLM providers in the last 30 days. Once captures land, links will appear here.'
												: 'No URLs have been captured yet. Once a BrandPrompt fires, citations from the LLM responses will appear here.'
										}
									/>
								}
								columns={[
									{
										key: 'url',
										header: 'URL',
										cell: (c) => (
											<a
												href={c.url}
												target="_blank"
												rel="noreferrer"
												className={`break-all text-sm hover:underline ${c.isOwnDomain ? 'font-medium' : ''}`}
											>
												{c.url}
											</a>
										),
									},
									{
										key: 'domain',
										header: 'Domain',
										cell: (c) => (
											<span className="flex items-center gap-1 text-xs">
												<Globe2 size={12} className="text-muted-foreground" />
												{c.domain}
											</span>
										),
									},
									{
										key: 'count',
										header: 'Citations',
										cell: (c) => <span className="font-mono text-sm">{c.totalCitations}</span>,
									},
									{
										key: 'providers',
										header: 'Providers',
										cell: (c) => (
											<div className="flex flex-wrap gap-1">
												{c.providers.map((p) => (
													<Badge key={p} variant="secondary" className="text-xs">
														{p}
													</Badge>
												))}
											</div>
										),
									},
									{
										key: 'lastSeen',
										header: 'Last seen',
										cell: (c) => (
											<span className="text-xs text-muted-foreground">
												{new Date(c.lastSeenAt).toLocaleDateString()}
											</span>
										),
									},
								]}
							/>
						)}
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
};
