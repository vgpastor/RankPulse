import { Button, Drawer, FormField, Input } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface AddCompetitorDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * BACKLOG A1. Drawer with a 2-field form (domain + label) that POSTs to
 * `/projects/:id/competitors` and invalidates the competitors query on
 * success so the list re-renders. Mobile-first: drawer renders as a bottom
 * sheet on small screens, side panel on md+.
 */
export const AddCompetitorDrawer = ({ projectId, open, onClose }: AddCompetitorDrawerProps) => {
	const qc = useQueryClient();
	const [domain, setDomain] = useState('');
	const [label, setLabel] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setDomain('');
		setLabel('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.projects.addCompetitor(projectId, { domain, label }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'competitors'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add competitor'),
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
			title="Add competitor"
			description="Track a competing domain alongside this project's main domain."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="add-competitor-form" disabled={mutation.isPending || !domain || !label}>
						{mutation.isPending ? 'Adding…' : 'Add competitor'}
					</Button>
				</>
			}
		>
			<form id="add-competitor-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Domain" hint="e.g. competitor.com (no protocol)">
					{(id) => (
						<Input
							id={id}
							value={domain}
							onChange={(e) => setDomain(e.target.value.trim().toLowerCase())}
							placeholder="competitor.com"
							required
							autoFocus
						/>
					)}
				</FormField>
				<FormField label="Label" hint="Display name shown in dashboards">
					{(id) => (
						<Input
							id={id}
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="Competitor X"
							required
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
