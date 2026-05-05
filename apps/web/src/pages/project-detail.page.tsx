import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner } from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { BookOpen, CalendarClock, Check, LineChart, MapPin, Plus, Search, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { AddCompetitorDrawer } from '../components/add-competitor-drawer.js';
import { AddDomainDrawer } from '../components/add-domain-drawer.js';
import { AddLocationDrawer } from '../components/add-location-drawer.js';
import { AppShell } from '../components/app-shell.js';
import { ImportKeywordsDrawer } from '../components/import-keywords-drawer.js';
import { LinkWikipediaDrawer } from '../components/link-wikipedia-drawer.js';
import { api } from '../lib/api.js';

export const ProjectDetailPage = () => {
	const { id } = useParams({ from: '/projects/$id' });
	const [openDrawer, setOpenDrawer] = useState<
		'competitor' | 'keywords' | 'domain' | 'location' | 'wikipedia' | null
	>(null);

	const projectQuery = useQuery({
		queryKey: ['project', id],
		queryFn: () => api.projects.get(id),
	});

	const competitorsQuery = useQuery({
		queryKey: ['project', id, 'competitors'],
		queryFn: () => api.projects.listCompetitors(id),
		enabled: Boolean(projectQuery.data),
	});

	const keywordsQuery = useQuery({
		queryKey: ['project', id, 'keywords'],
		queryFn: () => api.projects.listKeywordLists(id),
		enabled: Boolean(projectQuery.data),
	});

	const suggestionsQuery = useQuery({
		queryKey: ['project', id, 'competitor-suggestions'],
		queryFn: () => api.projects.listCompetitorSuggestions(id),
		enabled: Boolean(projectQuery.data),
	});

	const wikipediaQuery = useQuery({
		queryKey: ['project', id, 'wikipedia'],
		queryFn: () => api.wikipedia.listForProject(id),
		enabled: Boolean(projectQuery.data),
	});

	const qc = useQueryClient();
	const promoteSuggestion = useMutation({
		mutationFn: (suggestionId: string) => api.projects.promoteCompetitorSuggestion(suggestionId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', id, 'competitor-suggestions'] });
			qc.invalidateQueries({ queryKey: ['project', id, 'competitors'] });
		},
	});
	const dismissSuggestion = useMutation({
		mutationFn: (suggestionId: string) => api.projects.dismissCompetitorSuggestion(suggestionId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', id, 'competitor-suggestions'] });
		},
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

	if (projectQuery.isError || !projectQuery.data) {
		return (
			<AppShell>
				<p className="px-4 py-8 text-sm text-destructive sm:px-6">
					{projectQuery.error instanceof Error ? projectQuery.error.message : 'Project not found'}
				</p>
			</AppShell>
		);
	}

	const project = projectQuery.data;
	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1>
						<p className="text-sm text-muted-foreground">{project.primaryDomain}</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Link to="/projects/$id/rankings" params={{ id: project.id }}>
							<Button variant="secondary" size="sm">
								<LineChart size={14} />
								Rankings
							</Button>
						</Link>
						<Link to="/projects/$id/schedules" params={{ id: project.id }}>
							<Button variant="secondary" size="sm">
								<CalendarClock size={14} />
								Schedules
							</Button>
						</Link>
						<Link to="/projects/$id/gsc" params={{ id: project.id }}>
							<Button variant="secondary" size="sm">
								<Search size={14} />
								GSC
							</Button>
						</Link>
						<Badge
							variant={
								project.kind === 'OWN' ? 'default' : project.kind === 'COMPETITOR' ? 'warning' : 'secondary'
							}
						>
							{project.kind.toLowerCase()}
						</Badge>
					</div>
				</header>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="text-base">Domains ({project.domains.length})</CardTitle>
							<Button variant="ghost" size="sm" onClick={() => setOpenDrawer('domain')}>
								<Plus size={14} />
								Add
							</Button>
						</CardHeader>
						<CardContent>
							<ul className="space-y-1 text-sm">
								{project.domains.map((d) => (
									<li key={d.domain} className="flex items-center justify-between gap-2">
										<span className="break-all">{d.domain}</span>
										<Badge variant="secondary">{d.kind}</Badge>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="text-base">Locations ({project.locations.length})</CardTitle>
							<Button variant="ghost" size="sm" onClick={() => setOpenDrawer('location')}>
								<MapPin size={14} />
								Add
							</Button>
						</CardHeader>
						<CardContent>
							{project.locations.length === 0 ? (
								<p className="text-sm text-muted-foreground">No locations targeted yet.</p>
							) : (
								<ul className="space-y-1 text-sm">
									{project.locations.map((l) => (
										<li key={`${l.country}-${l.language}`}>
											{l.language} · {l.country}
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="text-base">
								Competitors ({competitorsQuery.data?.length ?? '…'})
							</CardTitle>
							<Button variant="ghost" size="sm" onClick={() => setOpenDrawer('competitor')}>
								<Plus size={14} />
								Add
							</Button>
						</CardHeader>
						<CardContent>
							{competitorsQuery.isLoading ? (
								<Spinner />
							) : competitorsQuery.data && competitorsQuery.data.length > 0 ? (
								<ul className="space-y-1 text-sm">
									{competitorsQuery.data.map((c) => (
										<li key={c.id} className="break-words">
											<span className="font-medium">{c.label}</span>{' '}
											<span className="text-muted-foreground">· {c.domain}</span>
										</li>
									))}
								</ul>
							) : (
								<EmptyState
									title="No competitors tracked"
									description="Add a competing domain to compare rankings side-by-side."
									action={
										<Button size="sm" onClick={() => setOpenDrawer('competitor')}>
											<Plus size={14} />
											Add competitor
										</Button>
									}
								/>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="flex items-center gap-2 text-base">
								<Sparkles size={14} className="text-primary" />
								Suggested competitors
								{suggestionsQuery.data && suggestionsQuery.data.length > 0 && (
									<Badge variant="default">{suggestionsQuery.data.length}</Badge>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{suggestionsQuery.isLoading ? (
								<Spinner />
							) : suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
								<ul className="space-y-2 text-sm">
									{suggestionsQuery.data.map((s) => (
										<li
											key={s.id}
											className="flex flex-col gap-2 rounded border border-border p-2 sm:flex-row sm:items-center sm:justify-between"
										>
											<div className="min-w-0 flex-1">
												<p className="break-words font-medium">{s.domain}</p>
												<p className="text-xs text-muted-foreground">
													{s.distinctKeywordsInTop10} keywords · {s.totalTop10Hits} top-10 hits
												</p>
											</div>
											<div className="flex gap-1">
												<Button
													size="sm"
													variant="ghost"
													disabled={promoteSuggestion.isPending}
													onClick={() => promoteSuggestion.mutate(s.id)}
													aria-label={`Promote ${s.domain}`}
												>
													<Check size={14} />
													Promote
												</Button>
												<Button
													size="sm"
													variant="ghost"
													disabled={dismissSuggestion.isPending}
													onClick={() => dismissSuggestion.mutate(s.id)}
													aria-label={`Dismiss ${s.domain}`}
												>
													<X size={14} />
													Dismiss
												</Button>
											</div>
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-muted-foreground">
									No suggestions yet. Once SERP fetches run for this project, frequent top-10 domains will
									show up here.
								</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="flex items-center gap-2 text-base">
								<BookOpen size={14} className="text-primary" />
								Wikipedia entities ({wikipediaQuery.data?.length ?? '…'})
							</CardTitle>
							<Button variant="ghost" size="sm" onClick={() => setOpenDrawer('wikipedia')}>
								<Plus size={14} />
								Link
							</Button>
						</CardHeader>
						<CardContent>
							{wikipediaQuery.isLoading ? (
								<Spinner />
							) : wikipediaQuery.data && wikipediaQuery.data.length > 0 ? (
								<ul className="space-y-1 text-sm">
									{wikipediaQuery.data.map((a) => (
										<li key={a.id} className="break-words">
											<span className="font-medium">{a.label}</span>{' '}
											<span className="text-muted-foreground">
												· {a.slug} on {a.wikipediaProject}
											</span>
										</li>
									))}
								</ul>
							) : (
								<EmptyState
									title="No Wikipedia entities tracked"
									description="Link an article (yours, a competitor's, or an industry topic) to monitor pageviews as a brand-awareness signal."
									action={
										<Button size="sm" onClick={() => setOpenDrawer('wikipedia')}>
											<Plus size={14} />
											Link article
										</Button>
									}
								/>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="text-base">
								Keyword lists ({keywordsQuery.data?.reduce((acc, l) => acc + l.keywords.length, 0) ?? '…'})
							</CardTitle>
							<Button variant="ghost" size="sm" onClick={() => setOpenDrawer('keywords')}>
								<Plus size={14} />
								Import
							</Button>
						</CardHeader>
						<CardContent>
							{keywordsQuery.isLoading ? (
								<Spinner />
							) : keywordsQuery.data && keywordsQuery.data.length > 0 ? (
								<ul className="space-y-2 text-sm">
									{keywordsQuery.data.map((list) => (
										<li key={list.id}>
											<p className="font-medium">{list.name}</p>
											<p className="text-xs text-muted-foreground">{list.keywords.length} keywords</p>
										</li>
									))}
								</ul>
							) : (
								<EmptyState
									title="No keywords yet"
									description="Bulk-import a list of phrases to start tracking."
									action={
										<Button size="sm" onClick={() => setOpenDrawer('keywords')}>
											<Plus size={14} />
											Import keywords
										</Button>
									}
								/>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<AddCompetitorDrawer
				projectId={id}
				open={openDrawer === 'competitor'}
				onClose={() => setOpenDrawer(null)}
			/>
			<ImportKeywordsDrawer
				projectId={id}
				open={openDrawer === 'keywords'}
				onClose={() => setOpenDrawer(null)}
			/>
			<AddDomainDrawer projectId={id} open={openDrawer === 'domain'} onClose={() => setOpenDrawer(null)} />
			<AddLocationDrawer
				projectId={id}
				open={openDrawer === 'location'}
				onClose={() => setOpenDrawer(null)}
			/>
			<LinkWikipediaDrawer
				projectId={id}
				open={openDrawer === 'wikipedia'}
				onClose={() => setOpenDrawer(null)}
			/>
		</AppShell>
	);
};
