import { Button, Drawer, FormField, Input } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface AddRadarDomainDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * Issue #25 — atomic-design organism. Mobile-first drawer to register
 * a bare domain for Cloudflare Radar monthly rank monitoring. The
 * domain is canonicalised (lowercased, www. stripped) on the server so
 * "WWW.Example.com" and "example.com" collide as one row.
 */
export const AddRadarDomainDrawer = ({ projectId, open, onClose }: AddRadarDomainDrawerProps) => {
	const qc = useQueryClient();
	const [domain, setDomain] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setDomain('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.radar.add(projectId, { domain }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'radar'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add monitored domain'),
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
			title="Monitor a domain (Cloudflare Radar)"
			description="Track a domain's global popularity ranking from Cloudflare's 1.1.1.1 resolver telemetry. Snapshotted monthly."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="add-radar-domain-form" disabled={mutation.isPending || !domain}>
						{mutation.isPending ? 'Adding…' : 'Monitor'}
					</Button>
				</>
			}
		>
			<form id="add-radar-domain-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Domain" hint="Bare domain only — no scheme, no path. Example: example.com">
					{(id) => (
						<Input
							id={id}
							value={domain}
							onChange={(e) => setDomain(e.target.value.trim())}
							placeholder="example.com"
							required
							autoFocus
						/>
					)}
				</FormField>
				<p className="text-xs text-muted-foreground">
					Long-tail domains may not have a global rank — that's fine, the snapshot stores rank: null and the
					timeline records the gap. Once the domain enters Cloudflare's ranking, the next monthly cron picks
					it up.
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
