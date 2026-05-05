import { Button, Drawer, FormField, Input, Select } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface TrackPageDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * Issue #18 — atomic-design organism. Mobile-first drawer to start
 * tracking a (URL, strategy) pair for PSI Core Web Vitals. Same URL
 * with mobile + desktop strategies are two distinct tracked pages so
 * the operator gets both signals.
 */
export const TrackPageDrawer = ({ projectId, open, onClose }: TrackPageDrawerProps) => {
	const qc = useQueryClient();
	const [url, setUrl] = useState('');
	const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setUrl('');
		setStrategy('mobile');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.pageSpeed.track(projectId, { url, strategy }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'page-speed'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to track page'),
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
			title="Track page (PSI / Core Web Vitals)"
			description="LCP, INP, CLS plus Lighthouse scores will be fetched daily."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="track-page-form" disabled={mutation.isPending || !url}>
						{mutation.isPending ? 'Tracking…' : 'Track page'}
					</Button>
				</>
			}
		>
			<form id="track-page-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="URL" hint="Absolute URL of the page (https://example.com/landing).">
					{(id) => (
						<Input
							id={id}
							value={url}
							onChange={(e) => setUrl(e.target.value.trim())}
							placeholder="https://example.com/"
							required
							autoFocus
						/>
					)}
				</FormField>
				<FormField label="Strategy" hint="Track the same URL twice (mobile + desktop) for both signals.">
					{(id) => (
						<Select
							id={id}
							value={strategy}
							onChange={(e) => setStrategy(e.target.value as 'mobile' | 'desktop')}
						>
							<option value="mobile">Mobile</option>
							<option value="desktop">Desktop</option>
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
