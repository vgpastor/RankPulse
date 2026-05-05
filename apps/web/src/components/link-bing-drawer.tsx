import { Button, Drawer, FormField, Input } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface LinkBingDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * Issue #20 — atomic-design organism. Mobile-first drawer to link a
 * Bing-verified property. Bing only supports URL-prefix verification
 * (no domain-property analogue), so we accept any absolute http(s) URL.
 *
 * Reminder copy spells out the prerequisite: Bing requires the
 * site to be verified AND the API key to be generated under
 * Settings → API Access on the same Bing Webmaster account.
 */
export const LinkBingDrawer = ({ projectId, open, onClose }: LinkBingDrawerProps) => {
	const qc = useQueryClient();
	const [siteUrl, setSiteUrl] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setSiteUrl('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.bing.link(projectId, { siteUrl }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'bing'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to link Bing property'),
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
			title="Link Bing Webmaster"
			description="Daily clicks, impressions and average position for a verified Bing property."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="link-bing-form" disabled={mutation.isPending || !siteUrl}>
						{mutation.isPending ? 'Linking…' : 'Link property'}
					</Button>
				</>
			}
		>
			<form id="link-bing-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Site URL" hint="Absolute URL of the verified Bing property (https://example.com).">
					{(id) => (
						<Input
							id={id}
							value={siteUrl}
							onChange={(e) => setSiteUrl(e.target.value.trim())}
							placeholder="https://example.com/"
							required
							autoFocus
						/>
					)}
				</FormField>
				<p className="text-xs text-muted-foreground">
					The site must be verified in Bing Webmaster, and the API key (Settings → API Access) must belong to
					the same account that owns the verification. Without that the daily fetch fails with 401.
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
