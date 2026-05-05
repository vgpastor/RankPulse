import { Button, Drawer, FormField, Input, Select, Spinner, Textarea } from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

export interface ScheduleFetchDrawerProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
}

const DEFAULT_PARAMS_HINT: Record<string, string> = {
	'serp-google-organic-live': JSON.stringify(
		{ keyword: 'control de rondas', locationCode: 2724, languageCode: 'es', device: 'desktop', depth: 20 },
		null,
		2,
	),
	'gsc-search-analytics': JSON.stringify(
		{ propertyId: '<gsc-property-id>', dimensions: ['query', 'page'] },
		null,
		2,
	),
};

export const ScheduleFetchDrawer = ({ open, onClose, projectId }: ScheduleFetchDrawerProps) => {
	const qc = useQueryClient();
	const [providerId, setProviderId] = useState('dataforseo');
	const [endpointId, setEndpointId] = useState('serp-google-organic-live');
	const [cron, setCron] = useState('0 6 * * 1');
	const [paramsJson, setParamsJson] = useState(DEFAULT_PARAMS_HINT['serp-google-organic-live'] ?? '{}');
	const [error, setError] = useState<string | null>(null);

	const providersQuery = useQuery({
		queryKey: ['providers'],
		queryFn: () => api.providers.list(),
		enabled: open,
	});

	const selectedProvider = providersQuery.data?.find((p) => p.id === providerId);
	const endpoints = selectedProvider?.endpoints ?? [];

	useEffect(() => {
		if (endpoints.length > 0 && !endpoints.some((e) => e.id === endpointId)) {
			const first = endpoints[0];
			if (first) {
				setEndpointId(first.id);
				setCron(first.defaultCron ?? '0 6 * * 1');
				setParamsJson(DEFAULT_PARAMS_HINT[first.id] ?? '{}');
			}
		}
	}, [endpoints, endpointId]);

	const helperHint = useMemo(() => {
		const ep = endpoints.find((e) => e.id === endpointId);
		if (!ep) return undefined;
		return `${ep.displayName} · ${ep.cost.amount} ${ep.cost.unit}/call · default cron: ${ep.defaultCron ?? '—'}`;
	}, [endpoints, endpointId]);

	const mutation = useMutation({
		mutationFn: () => {
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(paramsJson) as Record<string, unknown>;
			} catch {
				throw new Error('Params is not valid JSON');
			}
			return api.providers.scheduleEndpoint(providerId, endpointId, {
				projectId,
				providerId,
				endpointId,
				params: parsed,
				cron,
			});
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'schedules'] });
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to schedule fetch'),
	});

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	return (
		<Drawer
			open={open}
			onClose={onClose}
			title="Schedule recurring fetch"
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="schedule-fetch-form" disabled={mutation.isPending}>
						{mutation.isPending ? 'Scheduling…' : 'Schedule'}
					</Button>
				</>
			}
		>
			<form id="schedule-fetch-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				{providersQuery.isLoading ? (
					<Spinner />
				) : (
					<>
						<FormField label="Provider">
							{(id) => (
								<Select id={id} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
									{providersQuery.data?.map((p) => (
										<option key={p.id} value={p.id}>
											{p.displayName}
										</option>
									))}
								</Select>
							)}
						</FormField>
						<FormField label="Endpoint" hint={helperHint}>
							{(id) => (
								<Select
									id={id}
									value={endpointId}
									onChange={(e) => {
										const next = e.target.value;
										setEndpointId(next);
										const ep = endpoints.find((x) => x.id === next);
										if (ep?.defaultCron) setCron(ep.defaultCron);
										setParamsJson(DEFAULT_PARAMS_HINT[next] ?? '{}');
									}}
								>
									{endpoints.map((e) => (
										<option key={e.id} value={e.id}>
											{e.displayName}
										</option>
									))}
								</Select>
							)}
						</FormField>
						<FormField label="Cron" hint="5-field. e.g. '0 6 * * 1' = Monday 06:00 UTC.">
							{(id) => (
								<Input
									id={id}
									value={cron}
									onChange={(e) => setCron(e.target.value)}
									className="font-mono"
									required
								/>
							)}
						</FormField>
						<FormField label="Params (JSON)" hint="Validated server-side against the endpoint schema.">
							{(id) => (
								<Textarea
									id={id}
									value={paramsJson}
									onChange={(e) => setParamsJson(e.target.value)}
									rows={10}
									className="min-h-48 font-mono text-xs"
								/>
							)}
						</FormField>
						{error ? (
							<p className="text-sm text-destructive" role="alert">
								{error}
							</p>
						) : null}
					</>
				)}
			</form>
		</Drawer>
	);
};
