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
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { LinkGa4Drawer } from '../components/link-ga4-drawer.js';
import { api } from '../lib/api.js';

export const Ga4PropertiesPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/ga4' });
	const { t } = useTranslation('ga4');
	const [linkOpen, setLinkOpen] = useState(false);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const propertiesQuery = useQuery({
		queryKey: ['project', projectId, 'ga4'],
		queryFn: () => api.ga4.listForProject(projectId),
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
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('listTitle')}</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · {t('listSubtitle')}
						</p>
					</div>
					<Button size="sm" onClick={() => setLinkOpen(true)}>
						<Plus size={14} />
						{t('link')}
					</Button>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							{t('properties')} ({propertiesQuery.data?.length ?? '…'})
						</CardTitle>
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
										title={t('emptyTitle')}
										description={t('emptyDescription')}
										action={
											<Button size="sm" onClick={() => setLinkOpen(true)}>
												<Plus size={14} />
												{t('link')}
											</Button>
										}
									/>
								}
								columns={[
									{
										key: 'handle',
										header: t('handle'),
										cell: (p) => <span className="break-all font-medium">properties/{p.propertyHandle}</span>,
									},
									{
										key: 'status',
										header: t('status'),
										cell: (p) => (
											<Badge variant={p.isActive ? 'default' : 'secondary'}>
												{p.isActive ? t('statusActive') : t('statusUnlinked')}
											</Badge>
										),
									},
									{
										key: 'linked',
										header: t('linkedAt'),
										cell: (p) => <span className="text-xs">{new Date(p.linkedAt).toLocaleDateString()}</span>,
										hideOnMobile: true,
									},
									{
										key: 'actions',
										header: t('actions'),
										cell: (p) => (
											<Link to="/projects/$id/ga4/$propertyId" params={{ id: projectId, propertyId: p.id }}>
												<Button variant="ghost" size="sm">
													<LineChart size={14} />
													{t('view')}
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

			<LinkGa4Drawer projectId={projectId} open={linkOpen} onClose={() => setLinkOpen(false)} />
		</AppShell>
	);
};
