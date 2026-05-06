import { Button, Drawer, FormField, Input, Select, Spinner, Textarea } from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { ENTITY_BOUND_ENDPOINT_IDS } from '../lib/entity-bound-endpoints.js';

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
	'serp-google-organic-advanced': JSON.stringify(
		{ keyword: 'control de rondas', locationCode: 2724, languageCode: 'es', device: 'desktop', depth: 20 },
		null,
		2,
	),
	'keywords-data-search-volume': JSON.stringify(
		{ keywords: ['keyword 1', 'keyword 2'], locationCode: 2724, languageCode: 'es' },
		null,
		2,
	),
	'dataforseo-labs-keyword-difficulty': JSON.stringify(
		{ keywords: ['keyword 1', 'keyword 2'], locationCode: 2724, languageCode: 'es' },
		null,
		2,
	),
	'dataforseo-labs-keywords-for-site': JSON.stringify(
		{ target: 'example.com', locationCode: 2724, languageCode: 'es', limit: 100 },
		null,
		2,
	),
	'dataforseo-labs-related-keywords': JSON.stringify(
		{ keyword: 'control de rondas', locationCode: 2724, languageCode: 'es', depth: 2, limit: 100 },
		null,
		2,
	),
	'dataforseo-labs-competitors-domain': JSON.stringify(
		{ target: 'example.com', locationCode: 2724, languageCode: 'es', limit: 50 },
		null,
		2,
	),
	'domain-analytics-whois-overview': JSON.stringify({ target: 'example.com', limit: 1 }, null, 2),
	'on-page-instant-pages': JSON.stringify(
		{ url: 'https://example.com/', enableJavascript: false, loadResources: false },
		null,
		2,
	),
	// Entity-bound endpoints (gsc-search-analytics, ga4-run-report, etc.) are
	// intentionally absent: they're auto-scheduled by their bounded context
	// when the underlying entity is linked, so this drawer never schedules
	// them. See ADR 0001.
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

	// Hide providers whose endpoints are ALL entity-bound — those JobDefinitions
	// are created automatically when the user links the entity (ADR 0001), so
	// they don't belong in the manual schedule flow.
	const schedulableProviders = useMemo(
		() =>
			(providersQuery.data ?? []).filter((p) =>
				p.endpoints.some((e) => !ENTITY_BOUND_ENDPOINT_IDS.has(e.id)),
			),
		[providersQuery.data],
	);
	const selectedProvider = schedulableProviders.find((p) => p.id === providerId);
	const endpoints = useMemo(
		() => (selectedProvider?.endpoints ?? []).filter((e) => !ENTITY_BOUND_ENDPOINT_IDS.has(e.id)),
		[selectedProvider],
	);

	// If the user lands on a provider that no longer exists in the filtered
	// list (e.g. the default `dataforseo` is fine, but defensive against future
	// state) re-anchor on the first schedulable provider.
	useEffect(() => {
		if (schedulableProviders.length > 0 && !schedulableProviders.some((p) => p.id === providerId)) {
			const first = schedulableProviders[0];
			if (first) setProviderId(first.id);
		}
	}, [schedulableProviders, providerId]);

	useEffect(() => {
		if (endpoints.length > 0 && !endpoints.some((e) => e.id === endpointId)) {
			const first = endpoints[0];
			if (first) {
				setEndpointId(first.id);
				setCron(first.defaultCron);
				setParamsJson(DEFAULT_PARAMS_HINT[first.id] ?? '{}');
			}
		}
	}, [endpoints, endpointId]);

	const helperHint = useMemo(() => {
		const ep = endpoints.find((e) => e.id === endpointId);
		if (!ep) return undefined;
		return `${ep.displayName} · ${ep.cost.amount} ${ep.cost.unit}/call · default cron: ${ep.defaultCron}`;
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
						<p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
							Endpoints that ingest into a per-entity hypertable (GSC, GA4, Bing, Wikipedia, Clarity,
							PageSpeed, Cloudflare Radar) are auto-scheduled when you link the entity — they're hidden here.
							Link those from <strong>Settings → Providers</strong>.
						</p>
						<FormField label="Provider">
							{(id) => (
								<Select id={id} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
									{schedulableProviders.map((p) => (
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
										if (ep) setCron(ep.defaultCron);
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
