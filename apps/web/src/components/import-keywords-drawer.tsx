import { Button, Drawer, FormField, Input, Textarea } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

export interface ImportKeywordsDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

interface ParsedPhrase {
	phrase: string;
	tags: string[];
}

/**
 * Parse one keyword per line. Inline tags use `#TAG` syntax (e.g. `seo #ES #core`)
 * and are stripped from the phrase. Empty lines are skipped.
 */
const parsePhrases = (raw: string): ParsedPhrase[] => {
	return raw
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const tokens = line.split(/\s+/);
			const tags: string[] = [];
			const phraseTokens: string[] = [];
			for (const token of tokens) {
				if (token.startsWith('#') && token.length > 1) tags.push(token.slice(1));
				else phraseTokens.push(token);
			}
			return { phrase: phraseTokens.join(' '), tags };
		})
		.filter((p) => p.phrase.length > 0);
};

/**
 * BACKLOG A2. Drawer with a textarea (one keyword per line, optional inline
 * `#TAG` annotations) + an optional listName field. POSTs to
 * `/projects/:id/keywords` with up to 2000 phrases per call.
 */
export const ImportKeywordsDrawer = ({ projectId, open, onClose }: ImportKeywordsDrawerProps) => {
	const qc = useQueryClient();
	const [listName, setListName] = useState('');
	const [raw, setRaw] = useState('');
	const [error, setError] = useState<string | null>(null);

	const parsed = useMemo(() => parsePhrases(raw), [raw]);

	const reset = () => {
		setListName('');
		setRaw('');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () =>
			api.projects.importKeywords(projectId, {
				listName: listName.trim() || undefined,
				phrases: parsed.map((p) => ({ phrase: p.phrase, tags: p.tags.length ? p.tags : undefined })),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'keywords'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to import keywords'),
	});

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		if (parsed.length === 0) {
			setError('Add at least one keyword (one per line).');
			return;
		}
		if (parsed.length > 2000) {
			setError(`Too many keywords: ${parsed.length}. Max 2000 per import — split into batches.`);
			return;
		}
		mutation.mutate();
	};

	return (
		<Drawer
			open={open}
			onClose={() => {
				reset();
				onClose();
			}}
			title="Import keywords"
			description="One keyword per line. Use #TAG to annotate (e.g. control de rondas #ES #core)."
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="import-keywords-form"
						disabled={mutation.isPending || parsed.length === 0}
					>
						{mutation.isPending
							? 'Importing…'
							: `Import ${parsed.length} keyword${parsed.length === 1 ? '' : 's'}`}
					</Button>
				</>
			}
		>
			<form id="import-keywords-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField label="List name" hint="Optional — defaults to a timestamped list">
					{(id) => (
						<Input
							id={id}
							value={listName}
							onChange={(e) => setListName(e.target.value)}
							placeholder="Q2 priority terms"
							maxLength={80}
						/>
					)}
				</FormField>
				<FormField label={`Keywords (${parsed.length})`} hint="Up to 2000 per batch.">
					{(id) => (
						<Textarea
							id={id}
							value={raw}
							onChange={(e) => setRaw(e.target.value)}
							placeholder={'control de rondas #ES #core\nguardia jurado madrid #ES\n…'}
							rows={10}
							className="min-h-48 font-mono text-xs"
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
