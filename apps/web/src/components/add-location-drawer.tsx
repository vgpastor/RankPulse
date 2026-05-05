import { Button, Drawer, FormField, Input } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface AddLocationDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * BACKLOG A5 (location part). Adds a (country, language) pair to a project's
 * targeted locations. ISO 3166-1 alpha-2 country (e.g. ES, US) + BCP-47 language
 * (e.g. es, es-ES, en-US).
 */
export const AddLocationDrawer = ({ projectId, open, onClose }: AddLocationDrawerProps) => {
	const qc = useQueryClient();
	const [country, setCountry] = useState('');
	const [language, setLanguage] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setCountry('');
		setLanguage('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.projects.addLocation(projectId, { country, language }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add location'),
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
			title="Add location"
			description="Country + language pair to track rankings in."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="add-location-form"
						disabled={mutation.isPending || !country || !language}
					>
						{mutation.isPending ? 'Adding…' : 'Add location'}
					</Button>
				</>
			}
		>
			<form id="add-location-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Country" hint="ISO 3166-1 alpha-2 (uppercase, e.g. ES, US, FR).">
					{(id) => (
						<Input
							id={id}
							value={country}
							onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
							placeholder="ES"
							maxLength={2}
							pattern="[A-Z]{2}"
							required
							autoFocus
						/>
					)}
				</FormField>
				<FormField label="Language" hint="BCP-47 (lowercase). e.g. es, es-ES, en-US.">
					{(id) => (
						<Input
							id={id}
							value={language}
							onChange={(e) => setLanguage(e.target.value.trim())}
							placeholder="es-ES"
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
