import type { ProjectManagementContracts } from '@rankpulse/contracts';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	EmptyState,
	Modal,
	Spinner,
} from '@rankpulse/ui';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '../components/app-shell.js';
import { CreatePortfolioDrawer } from '../components/create-portfolio-drawer.js';
import { api } from '../lib/api.js';
import { useAuthStore } from '../lib/auth-store.js';

type PortfolioDto = ProjectManagementContracts.PortfolioDto;

export const PortfoliosPage = () => {
	const me = useAuthStore((s) => s.me);
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState<PortfolioDto | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	// One query per organization the user belongs to. useQueries keeps them
	// independent so a slow org doesn't block the rest.
	const memberships = me?.memberships ?? [];
	const portfolioQueries = useQueries({
		queries: memberships.map((m) => ({
			queryKey: ['portfolios', m.organizationId],
			queryFn: () => api.projects.listPortfolios(m.organizationId),
			enabled: Boolean(me),
		})),
	});

	const allPortfolios: PortfolioDto[] = portfolioQueries.flatMap((q) => q.data ?? []);
	const isLoading = portfolioQueries.some((q) => q.isLoading);

	const deleteMutation = useMutation({
		mutationFn: (p: PortfolioDto) => api.projects.deletePortfolio(p.id),
		onSuccess: (_, p) => {
			qc.invalidateQueries({ queryKey: ['portfolios', p.organizationId] });
			setConfirmingDelete(null);
			setDeleteError(null);
		},
		onError: (err) => setDeleteError(err instanceof Error ? err.message : 'Delete failed'),
	});

	if (!me) {
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
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Portfolios</h1>
						<p className="text-sm text-muted-foreground">
							Group projects under portfolios (e.g. by client or product line).
						</p>
					</div>
					<Button size="sm" onClick={() => setCreateOpen(true)} disabled={memberships.length === 0}>
						<Plus size={14} />
						New portfolio
					</Button>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">All portfolios ({allPortfolios.length})</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<Spinner />
						) : (
							<DataTable<PortfolioDto>
								rows={allPortfolios}
								rowKey={(p) => p.id}
								empty={
									<EmptyState
										title="No portfolios yet"
										description="Create one to group related projects."
										action={
											<Button size="sm" onClick={() => setCreateOpen(true)}>
												<Plus size={14} />
												New portfolio
											</Button>
										}
									/>
								}
								columns={[
									{
										key: 'name',
										header: 'Name',
										cell: (p) => <span className="font-medium">{p.name}</span>,
									},
									{
										key: 'org',
										header: 'Organization',
										cell: (p) => (
											<span className="font-mono text-xs text-muted-foreground">
												{p.organizationId.slice(0, 8)}…
											</span>
										),
									},
									{
										key: 'projects',
										header: 'Projects',
										cell: (p) => (
											<Badge variant={p.projectCount > 0 ? 'default' : 'secondary'}>{p.projectCount}</Badge>
										),
									},
									{
										key: 'created',
										header: 'Created',
										cell: (p) => (
											<span className="text-xs">{new Date(p.createdAt).toLocaleDateString()}</span>
										),
									},
									{
										key: 'actions',
										header: 'Actions',
										cell: (p) => (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													setConfirmingDelete(p);
													setDeleteError(null);
												}}
												title="Delete"
											>
												<Trash2 size={14} />
												<span className="md:hidden">Delete</span>
											</Button>
										),
									},
								]}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			<CreatePortfolioDrawer
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				organizations={memberships}
			/>

			<Modal
				open={Boolean(confirmingDelete)}
				onClose={() => setConfirmingDelete(null)}
				title="Delete portfolio?"
				footer={
					<>
						<Button
							variant="ghost"
							onClick={() => setConfirmingDelete(null)}
							disabled={deleteMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => confirmingDelete && deleteMutation.mutate(confirmingDelete)}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
						</Button>
					</>
				}
			>
				The API rejects deletion when projects still reference the portfolio — reassign them first.
				{deleteError ? (
					<p className="mt-2 text-sm text-destructive" role="alert">
						{deleteError}
					</p>
				) : null}
			</Modal>
		</AppShell>
	);
};
