import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { LineChart } from 'lucide-react';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';

export const ProjectDetailPage = () => {
	const { id } = useParams({ from: '/projects/$id' });

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
				<p className="px-6 py-8 text-sm text-destructive">
					{projectQuery.error instanceof Error ? projectQuery.error.message : 'Project not found'}
				</p>
			</AppShell>
		);
	}

	const project = projectQuery.data;
	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
				<header className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
						<p className="text-sm text-muted-foreground">{project.primaryDomain}</p>
					</div>
					<div className="flex items-center gap-3">
						<Link to="/projects/$id/rankings" params={{ id: project.id }}>
							<Button variant="secondary" size="sm">
								<LineChart size={14} />
								Rankings
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
						<CardHeader>
							<CardTitle className="text-base">Domains ({project.domains.length})</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="space-y-1 text-sm">
								{project.domains.map((d) => (
									<li key={d.domain} className="flex items-center justify-between">
										<span>{d.domain}</span>
										<Badge variant="secondary">{d.kind}</Badge>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Locations ({project.locations.length})</CardTitle>
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
						<CardHeader>
							<CardTitle className="text-base">
								Competitors ({competitorsQuery.data?.length ?? '…'})
							</CardTitle>
						</CardHeader>
						<CardContent>
							{competitorsQuery.isLoading ? (
								<Spinner />
							) : competitorsQuery.data && competitorsQuery.data.length > 0 ? (
								<ul className="space-y-1 text-sm">
									{competitorsQuery.data.map((c) => (
										<li key={c.id}>
											<span className="font-medium">{c.label}</span> ·{' '}
											<span className="text-muted-foreground">{c.domain}</span>
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-muted-foreground">None tracked yet.</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Keyword lists ({keywordsQuery.data?.reduce((acc, l) => acc + l.keywords.length, 0) ?? '…'})
							</CardTitle>
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
								<p className="text-sm text-muted-foreground">No keywords imported yet.</p>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</AppShell>
	);
};
