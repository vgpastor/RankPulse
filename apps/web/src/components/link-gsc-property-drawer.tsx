import { Button, Drawer, FormField, Input, Select } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface LinkGscPropertyDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

export const LinkGscPropertyDrawer = ({ projectId, open, onClose }: LinkGscPropertyDrawerProps) => {
	const qc = useQueryClient();
	const [siteUrl, setSiteUrl] = useState('');
	const [propertyType, setPropertyType] = useState<'URL_PREFIX' | 'DOMAIN'>('URL_PREFIX');
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setSiteUrl('');
		setPropertyType('URL_PREFIX');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.gsc.linkProperty({ projectId, siteUrl, propertyType }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'gsc-properties'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to link property'),
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
			title="Link GSC property"
			description="Use the exact siteUrl from Search Console. URL_PREFIX includes protocol; DOMAIN is just the host."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="link-gsc-form" disabled={mutation.isPending || !siteUrl}>
						{mutation.isPending ? 'Linking…' : 'Link property'}
					</Button>
				</>
			}
		>
			<form id="link-gsc-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Property type">
					{(id) => (
						<Select
							id={id}
							value={propertyType}
							onChange={(e) => setPropertyType(e.target.value as typeof propertyType)}
						>
							<option value="URL_PREFIX">URL prefix</option>
							<option value="DOMAIN">Domain</option>
						</Select>
					)}
				</FormField>
				<FormField
					label="Site URL"
					hint={
						propertyType === 'URL_PREFIX'
							? 'e.g. https://example.com/ (with trailing slash)'
							: 'e.g. example.com (no protocol)'
					}
				>
					{(id) => (
						<Input
							id={id}
							value={siteUrl}
							onChange={(e) => setSiteUrl(e.target.value.trim())}
							placeholder={propertyType === 'URL_PREFIX' ? 'https://example.com/' : 'example.com'}
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
