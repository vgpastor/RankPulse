import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	EmptyState,
	Spinner,
} from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { LineChart, Plus } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '../components/app-shell.js';
import { LinkGscPropertyDrawer } from '../components/link-gsc-property-drawer.js';
import { api } from '../lib/api.js';

export const GscPropertiesPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/gsc' });
	const [linkOpen, setLinkOpen] = useState(false);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const propertiesQuery = useQuery({
		queryKey: ['project', projectId, 'gsc-properties'],
		queryFn: () => api.gsc.listForProject(projectId),
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

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Search Console</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · linked GSC properties.
						</p>
					</div>
					<Button size="sm" onClick={() => setLinkOpen(true)}>
						<Plus size={14} />
						Link property
					</Button>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Properties ({propertiesQuery.data?.length ?? '…'})</CardTitle>
					</CardHeader>
					<CardContent>
						{propertiesQuery.isLoading ? (
							<Spinner />
						) : (
							<DataTable
								rows={propertiesQuery.data ?? []}
								rowKey={(p) => p.id}
								empty={
									<EmptyState
										title="No GSC properties linked"
										description="Link a Search Console property (URL prefix or Domain) to see clicks, impressions, CTR and position."
										action={
											<Button size="sm" onClick={() => setLinkOpen(true)}>
												<Plus size={14} />
												Link property
											</Button>
										}
									/>
								}
								columns={[
									{
										key: 'site',
										header: 'Site',
										cell: (p) => <span className="break-all font-medium">{p.siteUrl}</span>,
									},
									{
										key: 'type',
										header: 'Type',
										cell: (p) => <Badge variant="secondary">{p.propertyType}</Badge>,
									},
									{
										key: 'linked',
										header: 'Linked at',
										cell: (p) => <span className="text-xs">{new Date(p.linkedAt).toLocaleDateString()}</span>,
									},
									{
										key: 'actions',
										header: 'Actions',
										cell: (p) => (
											<Link to="/projects/$id/gsc/$propertyId" params={{ id: projectId, propertyId: p.id }}>
												<Button variant="ghost" size="sm">
													<LineChart size={14} />
													Performance
												</Button>
											</Link>
										),
									},
								]}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			<LinkGscPropertyDrawer projectId={projectId} open={linkOpen} onClose={() => setLinkOpen(false)} />
		</AppShell>
	);
};
