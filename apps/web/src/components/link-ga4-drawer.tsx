import { Button, Drawer, FormField, Input } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface LinkGa4DrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * Issue #17 — atomic-design organism. Mobile-first drawer to link a
 * Google Analytics 4 property to a project. The handle accepts either
 * a bare numeric id or the `properties/<id>` form Google's UI shows;
 * the application layer canonicalises to the bare form before save.
 *
 * Reminder copy explains the SA-as-Viewer prerequisite — without that
 * step the daily fetch fails with 403 and the operator wastes a debug
 * cycle.
 */
export const LinkGa4Drawer = ({ projectId, open, onClose }: LinkGa4DrawerProps) => {
	const qc = useQueryClient();
	const [propertyHandle, setPropertyHandle] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setPropertyHandle('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.ga4.link(projectId, { propertyHandle }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'ga4'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to link GA4 property'),
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
			title="Link Google Analytics 4"
			description="Sessions, users, pageviews, conversions — fetched daily from your GA4 property."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="link-ga4-form" disabled={mutation.isPending || !propertyHandle}>
						{mutation.isPending ? 'Linking…' : 'Link property'}
					</Button>
				</>
			}
		>
			<form id="link-ga4-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField
					label="Property ID"
					hint="Numeric GA4 property id (e.g. 123456789) or the full properties/123456789 form."
				>
					{(id) => (
						<Input
							id={id}
							value={propertyHandle}
							onChange={(e) => setPropertyHandle(e.target.value.trim())}
							placeholder="123456789"
							required
							autoFocus
						/>
					)}
				</FormField>
				<p className="text-xs text-muted-foreground">
					The configured service account must be added as a Viewer on the GA4 property (Admin → Property
					Access Management). Without that the daily fetch fails with 403.
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
