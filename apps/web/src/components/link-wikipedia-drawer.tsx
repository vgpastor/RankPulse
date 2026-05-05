import { Button, Drawer, FormField, Input, Select } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface LinkWikipediaDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

/**
 * Issue #33 — atomic-design organism. Mobile-first drawer with three
 * inputs (Wikipedia language project + URL slug + optional label).
 * The Wikipedia project picker is a `<Select>` (atom) populated with
 * the languages we currently auto-handle; future work can swap it for
 * a free-form input or a fuller catalogue.
 */

const WIKIPEDIA_PROJECTS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: 'en.wikipedia.org', label: 'English (en.wikipedia.org)' },
	{ value: 'es.wikipedia.org', label: 'Spanish (es.wikipedia.org)' },
	{ value: 'fr.wikipedia.org', label: 'French (fr.wikipedia.org)' },
	{ value: 'de.wikipedia.org', label: 'German (de.wikipedia.org)' },
	{ value: 'it.wikipedia.org', label: 'Italian (it.wikipedia.org)' },
	{ value: 'pt.wikipedia.org', label: 'Portuguese (pt.wikipedia.org)' },
];

export const LinkWikipediaDrawer = ({ projectId, open, onClose }: LinkWikipediaDrawerProps) => {
	const qc = useQueryClient();
	const [wikipediaProject, setWikipediaProject] = useState('en.wikipedia.org');
	const [slug, setSlug] = useState('');
	const [label, setLabel] = useState('');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setSlug('');
		setLabel('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () =>
			api.wikipedia.link(projectId, {
				wikipediaProject,
				slug,
				label: label || undefined,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'wikipedia'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to link article'),
	});

	const onSubmit = (e: FormEvent): void => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	// Strip the host part if the operator pasted a full URL —
	// `https://en.wikipedia.org/wiki/Eiffel_Tower` → `Eiffel_Tower`.
	const normaliseSlug = (raw: string): string => {
		const m = raw.match(/\/wiki\/([^?#]+)/);
		const slugPart = m?.[1] ?? raw;
		try {
			return decodeURIComponent(slugPart);
		} catch {
			return slugPart;
		}
	};

	return (
		<Drawer
			open={open}
			onClose={() => {
				reset();
				onClose();
			}}
			title="Link Wikipedia article"
			description="Track this article's daily pageviews as an entity-awareness signal."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button type="submit" form="link-wikipedia-form" disabled={mutation.isPending || !slug}>
						{mutation.isPending ? 'Linking…' : 'Link article'}
					</Button>
				</>
			}
		>
			<form id="link-wikipedia-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="Wikipedia language" hint="The Wikipedia project where the article lives.">
					{(id) => (
						<Select id={id} value={wikipediaProject} onChange={(e) => setWikipediaProject(e.target.value)}>
							{WIKIPEDIA_PROJECTS.map((p) => (
								<option key={p.value} value={p.value}>
									{p.label}
								</option>
							))}
						</Select>
					)}
				</FormField>
				<FormField
					label="Article slug or URL"
					hint="Paste the Wikipedia URL or the slug (e.g. Eiffel_Tower)."
				>
					{(id) => (
						<Input
							id={id}
							value={slug}
							onChange={(e) => setSlug(normaliseSlug(e.target.value.trim()))}
							placeholder="Eiffel_Tower"
							required
							autoFocus
						/>
					)}
				</FormField>
				<FormField label="Label (optional)" hint="Defaults to the slug if omitted.">
					{(id) => (
						<Input
							id={id}
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="Our brand on Wikipedia"
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
