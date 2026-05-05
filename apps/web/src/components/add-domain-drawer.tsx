import { Button, Drawer, FormField, Input, Select } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface AddDomainDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * BACKLOG A5 (domain part). Adds a domain to a project. Three kinds:
 * `main` (canonical domain), `subdomain`, `alias` (alternative TLDs / migrated
 * properties).
 */
export const AddDomainDrawer = ({ projectId, open, onClose }: AddDomainDrawerProps) => {
	const qc = useQueryClient();
	const [domain, setDomain] = useState('');
	const [kind, setKind] = useState<'main' | 'subdomain' | 'alias'>('alias');
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setDomain('');
		setKind('alias');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.projects.addDomain(projectId, { domain, kind }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add domain'),
	});

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	return (
		<Drawer
			open={open}
			onClose={() => {
				reset();
				onClose();
			}}
			title="Add domain"
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="add-domain-form" disabled={mutation.isPending || !domain}>
						{mutation.isPending ? 'Adding…' : 'Add domain'}
					</Button>
				</>
			}
		>
			<form id="add-domain-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Domain" hint="No protocol, no path. e.g. example.com">
					{(id) => (
						<Input
							id={id}
							value={domain}
							onChange={(e) => setDomain(e.target.value.trim().toLowerCase())}
							placeholder="example.com"
							required
							autoFocus
						/>
					)}
				</FormField>
				<FormField label="Kind">
					{(id) => (
						<Select id={id} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
							<option value="main">main — canonical</option>
							<option value="subdomain">subdomain</option>
							<option value="alias">alias — alt TLD / redirect</option>
						</Select>
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
