import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import { Button, Drawer, FormField, Select, Textarea } from '@rankpulse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';

export interface AddBrandPromptDrawerProps {
	projectId: string;
	open: boolean;
	onClose: () => void;
}

const KIND_OPTIONS: Array<{
	value: AiSearchInsightsContracts.PromptKindContract;
	label: string;
	hint: string;
}> = [
	{
		value: 'category',
		label: 'category — discovery',
		hint: 'e.g. "best CRM for B2B SaaS startups"',
	},
	{
		value: 'comparative',
		label: 'comparative — vs competitor',
		hint: 'e.g. "patroltech vs tracktik"',
	},
	{
		value: 'transactional',
		label: 'transactional — buying intent',
		hint: 'e.g. "where to buy a guard tour patrol system"',
	},
	{
		value: 'branded',
		label: 'branded — brand-specific',
		hint: 'e.g. "patroltech reviews"',
	},
];

/**
 * Sub-issue #61 of #27 — registers a BrandPrompt for AI Brand Radar.
 * After save, the auto-schedule handler creates one daily fetch per
 * (LocationLanguage × OpenAI credential) so captures start within 24h.
 */
export const AddBrandPromptDrawer = ({ projectId, open, onClose }: AddBrandPromptDrawerProps) => {
	const qc = useQueryClient();
	const [text, setText] = useState('');
	const [kind, setKind] = useState<AiSearchInsightsContracts.PromptKindContract>('category');
	const [error, setError] = useState<string | null>(null);

	const reset = (): void => {
		setText('');
		setKind('category');
		setError(null);
	};

	const mutation = useMutation({
		mutationFn: () => api.aiSearch.createPrompt(projectId, { text: text.trim(), kind }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'brand-prompts'] });
			reset();
			onClose();
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Failed to register prompt'),
	});

	const onSubmit = (e: FormEvent): void => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	const trimmed = text.trim();
	const hint = KIND_OPTIONS.find((o) => o.value === kind)?.hint ?? '';

	return (
		<Drawer
			open={open}
			onClose={() => {
				reset();
				onClose();
			}}
			title="Track a prompt across LLM-search"
			footer={
				<>
					<Button variant="ghost" type="button" onClick={onClose} disabled={mutation.isPending}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="add-brand-prompt-form"
						disabled={mutation.isPending || trimmed.length < 3}
					>
						{mutation.isPending ? 'Saving…' : 'Track prompt'}
					</Button>
				</>
			}
		>
			<form id="add-brand-prompt-form" onSubmit={onSubmit} className="flex flex-col gap-4">
				<FormField
					label="Prompt"
					hint="The exact question we'll ask each LLM-search provider on every cron tick (07:00 UTC)."
				>
					{(id) => (
						<Textarea
							id={id}
							value={text}
							onChange={(e) => setText(e.target.value)}
							placeholder="best software for guard-tour patrols in Spain"
							rows={4}
							required
							autoFocus
							maxLength={1000}
						/>
					)}
				</FormField>
				<FormField label="Intent" hint={hint}>
					{(id) => (
						<Select id={id} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
							{KIND_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</Select>
					)}
				</FormField>
				<p className="text-xs text-muted-foreground">
					On save, RankPulse fans out one daily capture per locale of this project, across every connected LLM
					provider. Mentions and citations are extracted automatically by the LLM-judge.
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
