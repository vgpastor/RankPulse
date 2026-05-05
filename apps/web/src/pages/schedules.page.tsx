import type { ProviderConnectivityContracts } from '@rankpulse/contracts';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { CalendarPlus, History, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '../components/app-shell.js';
import { EditScheduleDrawer } from '../components/edit-schedule-drawer.js';
import { ScheduleFetchDrawer } from '../components/schedule-fetch-drawer.js';
import { ScheduleRunsDrawer } from '../components/schedule-runs-drawer.js';
import { api } from '../lib/api.js';

type JobDefinitionDto = ProviderConnectivityContracts.JobDefinitionDto;

export const SchedulesPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/schedules' });
	const qc = useQueryClient();

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const schedulesQuery = useQuery({
		queryKey: ['project', projectId, 'schedules'],
		queryFn: () => api.providers.listJobDefinitions(projectId),
	});

	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<JobDefinitionDto | null>(null);
	const [viewingRunsOf, setViewingRunsOf] = useState<JobDefinitionDto | null>(null);
	const [confirmingDelete, setConfirmingDelete] = useState<JobDefinitionDto | null>(null);
	const [runNowError, setRunNowError] = useState<string | null>(null);
	const [runNowSuccess, setRunNowSuccess] = useState<string | null>(null);

	const runNowMutation = useMutation({
		mutationFn: (def: JobDefinitionDto) => api.providers.runJobDefinitionNow(def.providerId, def.id),
		onSuccess: (result) => {
			setRunNowSuccess(
				`Run enqueued (${result.runId.slice(0, 8)}…). Check the runs drawer in a few seconds.`,
			);
			setRunNowError(null);
		},
		onError: (err) => setRunNowError(err instanceof Error ? err.message : 'Run-now failed'),
	});

	const deleteMutation = useMutation({
		mutationFn: (def: JobDefinitionDto) => api.providers.deleteJobDefinition(def.providerId, def.id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'schedules'] });
			setConfirmingDelete(null);
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

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Schedules</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · recurring fetches per provider/endpoint.
						</p>
					</div>
					<Button onClick={() => setCreateOpen(true)} size="sm">
						<CalendarPlus size={14} />
						New schedule
					</Button>
				</header>

				{(runNowError || runNowSuccess) && (
					<div
						className={
							runNowError
								? 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
								: 'rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary'
						}
						role="status"
					>
						{runNowError ?? runNowSuccess}
						<button
							type="button"
							className="ml-2 text-xs underline"
							onClick={() => {
								setRunNowError(null);
								setRunNowSuccess(null);
							}}
						>
							dismiss
						</button>
					</div>
				)}

				<Card>
					<CardHeader>
						<CardTitle className="text-base">All schedules ({schedulesQuery.data?.length ?? '…'})</CardTitle>
					</CardHeader>
					<CardContent>
						{schedulesQuery.isLoading ? (
							<Spinner />
						) : schedulesQuery.isError ? (
							<p className="text-sm text-destructive">
								{schedulesQuery.error instanceof Error ? schedulesQuery.error.message : 'Failed to load.'}
							</p>
						) : (
							<DataTable<JobDefinitionDto>
								rows={schedulesQuery.data ?? []}
								rowKey={(d) => d.id}
								empty={
									<EmptyState
										title="No schedules yet"
										description="Set up a recurring SERP or GSC fetch to start collecting data."
										action={
											<Button size="sm" onClick={() => setCreateOpen(true)}>
												<CalendarPlus size={14} />
												New schedule
											</Button>
										}
									/>
								}
								columns={[
									{
										key: 'endpoint',
										header: 'Endpoint',
										cell: (d) => (
											<div className="flex flex-col gap-0.5">
												<span className="font-medium">{d.endpointId}</span>
												<span className="text-xs text-muted-foreground">{d.providerId}</span>
											</div>
										),
									},
									{
										key: 'cron',
										header: 'Cron',
										cell: (d) => <code className="text-xs">{d.cron}</code>,
									},
									{
										key: 'status',
										header: 'Status',
										cell: (d) =>
											d.enabled ? <Badge>enabled</Badge> : <Badge variant="secondary">paused</Badge>,
									},
									{
										key: 'lastRun',
										header: 'Last run',
										cell: (d) =>
											d.lastRunAt ? (
												<span className="text-xs">{new Date(d.lastRunAt).toLocaleString()}</span>
											) : (
												<span className="text-xs text-muted-foreground">never</span>
											),
									},
									{
										key: 'actions',
										header: 'Actions',
										cell: (d) => (
											<div className="flex flex-wrap gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => runNowMutation.mutate(d)}
													disabled={runNowMutation.isPending}
													title="Run now"
												>
													<Play size={14} />
													<span className="md:hidden">Run</span>
												</Button>
												<Button variant="ghost" size="sm" onClick={() => setViewingRunsOf(d)} title="History">
													<History size={14} />
													<span className="md:hidden">History</span>
												</Button>
												<Button variant="ghost" size="sm" onClick={() => setEditing(d)} title="Edit">
													<Pencil size={14} />
													<span className="md:hidden">Edit</span>
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setConfirmingDelete(d)}
													title="Delete"
												>
													<Trash2 size={14} />
													<span className="md:hidden">Delete</span>
												</Button>
											</div>
										),
									},
								]}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			<ScheduleFetchDrawer projectId={projectId} open={createOpen} onClose={() => setCreateOpen(false)} />
			<EditScheduleDrawer
				projectId={projectId}
				open={Boolean(editing)}
				onClose={() => setEditing(null)}
				definition={editing}
			/>
			<ScheduleRunsDrawer
				open={Boolean(viewingRunsOf)}
				onClose={() => setViewingRunsOf(null)}
				providerId={viewingRunsOf?.providerId ?? ''}
				definitionId={viewingRunsOf?.id ?? null}
			/>

			<Modal
				open={Boolean(confirmingDelete)}
				onClose={() => setConfirmingDelete(null)}
				title="Delete schedule?"
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
				Past runs are kept; only the future cron is cancelled. This cannot be undone.
			</Modal>
		</AppShell>
	);
};
