import { Button, Drawer, FormField, Input } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface LinkClarityDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * Issue #43 — atomic-design organism. Mobile-first drawer to link a
 * Microsoft Clarity project so RankPulse can pull daily UX metrics
 * (sessions, distinct users, rage clicks, dead clicks, scroll depth,
 * engagement time).
 */
export const LinkClarityDrawer = ({ projectId, open, onClose }: LinkClarityDrawerProps) => {
	const qc = useQueryClient();
	const [clarityHandle, setClarityHandle] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setClarityHandle('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.clarity.link(projectId, { clarityHandle }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'clarity'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to link Clarity project'),
	});

	const onSubmit = (e: FormEvent): void => {
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
			title="Link Microsoft Clarity"
			description="Daily UX metrics — sessions, distinct users, rage clicks, dead clicks, scroll depth, engagement time."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="link-clarity-form" disabled={mutation.isPending || !clarityHandle}>
						{mutation.isPending ? 'Linking…' : 'Link project'}
					</Button>
				</>
			}
		>
			<form id="link-clarity-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField
					label="Clarity project handle"
					hint="The 8-32 character slug from your Clarity dashboard URL (clarity.microsoft.com/projects/<handle>)."
				>
					{(id) => (
						<Input
							id={id}
							value={clarityHandle}
							onChange={(e) => setClarityHandle(e.target.value.trim())}
							placeholder="claritySlug42"
							required
							autoFocus
						/>
					)}
				</FormField>
				<p className="text-xs text-muted-foreground">
					Generate the API token in Clarity → Settings → Data Export → Generate Token. The free tier gives 10
					req/day per project, plenty for one daily ingest cron.
				</p>
				{error ? (
					<p className="text-sm text-destructive" role="alert">
						{error}
					</p>
				) : null}
			</form>
		</Drawer>
	);
};
