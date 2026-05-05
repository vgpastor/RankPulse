import { Button, Drawer, FormField, Input, Select } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export interface CreatePortfolioDrawerProps {
	open: boolean;
	onClose: () => void;
	organizations: readonly { organizationId: string; role: string }[];
}

/**
 * BACKLOG #11 / #13. Drawer for creating a Portfolio inside one of the
 * authenticated user's organizations. The org dropdown is filled from
 * `me.memberships` so the user can only target orgs where they belong.
 */
export const CreatePortfolioDrawer = ({ open, onClose, organizations }: CreatePortfolioDrawerProps) => {
	const qc = useQueryClient();
	const [orgId, setOrgId] = useState<string>(organizations[0]?.organizationId ?? '');
	const [name, setName] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!orgId && organizations[0]) setOrgId(organizations[0].organizationId);
	}, [organizations, orgId]);

	const reset = () => {
		setName('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.projects.createPortfolio(orgId, { name }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['portfolios', orgId] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create portfolio'),
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
			title="Create portfolio"
			description="Group projects (e.g. by client or product line) under a portfolio."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="create-portfolio-form" disabled={mutation.isPending || !name || !orgId}>
						{mutation.isPending ? 'Creating…' : 'Create'}
					</Button>
				</>
			}
		>
			<form id="create-portfolio-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Organization" hint="Only orgs where you have a membership are listed.">
					{(id) => (
						<Select id={id} value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
							{organizations.map((m) => (
								<option key={m.organizationId} value={m.organizationId}>
									{m.organizationId.slice(0, 8)}… ({m.role})
								</option>
							))}
						</Select>
					)}
				</FormField>
				<FormField label="Portfolio name" hint="2-80 characters.">
					{(id) => (
						<Input
							id={id}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="PatrolTech"
							required
							autoFocus
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
