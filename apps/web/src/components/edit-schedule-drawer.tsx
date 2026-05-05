import type { ProviderConnectivityContracts } from '@rankpulse/contracts';
import { Button, Drawer, FormField, Input, Select, Textarea } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export interface EditScheduleDrawerProps {
	open: boolean;
	onClose: () => void;
	projectId: string;
	definition: ProviderConnectivityContracts.JobDefinitionDto | null;
}

/**
 * Edit cron, params (raw JSON), and enabled flag of an existing JobDefinition.
 * On submit, sends a PATCH; the API re-registers the BullMQ repeatable so cron
 * changes take effect immediately. JSON params are validated client-side as
 * "must parse" — server-side Zod still runs on persist.
 */
export const EditScheduleDrawer = ({ open, onClose, projectId, definition }: EditScheduleDrawerProps) => {
	const qc = useQueryClient();
	const [cron, setCron] = useState('');
	const [paramsJson, setParamsJson] = useState('{}');
	const [enabled, setEnabled] = useState<'true' | 'false'>('true');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (definition) {
			setCron(definition.cron);
			setParamsJson(JSON.stringify(definition.params, null, 2));
			setEnabled(definition.enabled ? 'true' : 'false');
			setError(null);
		}
	}, [definition]);

	const mutation = useMutation({
		mutationFn: () => {
			if (!definition) throw new Error('No definition selected');
			let parsedParams: Record<string, unknown> | undefined;
			try {
				parsedParams = JSON.parse(paramsJson) as Record<string, unknown>;
			} catch {
				throw new Error('Params is not valid JSON');
			}
			return api.providers.updateJobDefinition(definition.providerId, definition.id, {
				cron: cron !== definition.cron ? cron : undefined,
				params: parsedParams,
				enabled: enabled === 'true',
			});
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'schedules'] });
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update schedule'),
	});

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	if (!definition) return null;

	return (
		<Drawer
			open={open}
			onClose={onClose}
			title="Edit schedule"
			description={`${definition.providerId} · ${definition.endpointId}`}
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="edit-schedule-form" disabled={mutation.isPending}>
						{mutation.isPending ? 'Saving…' : 'Save changes'}
					</Button>
				</>
			}
		>
			<form id="edit-schedule-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Cron expression" hint="5-field standard cron, e.g. '0 6 * * 1' = Monday 06:00 UTC.">
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
				<FormField label="Status">
					{(id) => (
						<Select id={id} value={enabled} onChange={(e) => setEnabled(e.target.value as 'true' | 'false')}>
							<option value="true">Enabled</option>
							<option value="false">Paused — won't run</option>
						</Select>
					)}
				</FormField>
				<FormField label="Params (JSON)" hint="Validated against the endpoint paramsSchema on save.">
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
			</form>
		</Drawer>
	);
};
