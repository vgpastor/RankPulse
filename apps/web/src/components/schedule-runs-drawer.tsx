import type { ProviderConnectivityContracts } from '@rankpulse/contracts';
import { Badge, DataTable, Drawer, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

type JobRunDto = ProviderConnectivityContracts.JobRunDto;

export interface ScheduleRunsDrawerProps {
	open: boolean;
	onClose: () => void;
	providerId: string;
	definitionId: string | null;
}

const statusVariant = (status: JobRunDto['status']): 'default' | 'warning' | 'secondary' => {
	if (status === 'succeeded') return 'default';
	if (status === 'failed') return 'warning';
	return 'secondary';
};

const formatDuration = (startedAt: string, finishedAt: string | null): string => {
	if (!finishedAt) return '—';
	const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
	if (ms < 1000) return `${ms} ms`;
	return `${(ms / 1000).toFixed(1)} s`;
};

export const ScheduleRunsDrawer = ({ open, onClose, providerId, definitionId }: ScheduleRunsDrawerProps) => {
	const runsQuery = useQuery({
		queryKey: ['provider', providerId, 'job-definition', definitionId, 'runs'],
		queryFn: () => api.providers.listJobRuns(providerId, definitionId ?? ''),
		enabled: open && Boolean(definitionId),
		refetchInterval: open ? 5_000 : false,
	});

	return (
		<Drawer
			open={open}
			onClose={onClose}
			title="Run history"
			description="Most recent 50 runs (auto-refreshes every 5s)."
		>
			{runsQuery.isLoading ? (
				<div className="flex justify-center py-6">
					<Spinner />
				</div>
			) : runsQuery.isError ? (
				<p className="text-sm text-destructive" role="alert">
					{runsQuery.error instanceof Error ? runsQuery.error.message : 'Failed to load runs'}
				</p>
			) : (
				<DataTable<JobRunDto>
					columns={[
						{
							key: 'status',
							header: 'Status',
							cell: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
						},
						{
							key: 'startedAt',
							header: 'Started',
							cell: (r) => (
								<span className="font-mono text-xs">{new Date(r.startedAt).toLocaleString()}</span>
							),
						},
						{
							key: 'duration',
							header: 'Duration',
							cell: (r) => (
								<span className="font-mono text-xs">{formatDuration(r.startedAt, r.finishedAt)}</span>
							),
						},
						{
							key: 'error',
							header: 'Error',
							cell: (r) =>
								r.error ? (
									<span className="text-xs text-destructive break-words">
										[{r.error.code}] {r.error.message}
									</span>
								) : (
									<span className="text-xs text-muted-foreground">—</span>
								),
						},
					]}
					rows={runsQuery.data ?? []}
					rowKey={(r) => r.id}
					empty="No runs yet — schedule cron hasn't fired or use Run Now."
				/>
			)}
		</Drawer>
	);
};
