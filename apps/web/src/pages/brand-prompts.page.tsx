import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	EmptyState,
	Spinner,
} from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Pause, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AddBrandPromptDrawer } from '../components/add-brand-prompt-drawer.js';
import { AppShell } from '../components/app-shell.js';
import { BrandPromptHistoryDrawer } from '../components/brand-prompt-history-drawer.js';
import { api } from '../lib/api.js';

type BrandPromptDto = AiSearchInsightsContracts.BrandPromptDtoSchema;

/**
 * Sub-issue #61 of #27 — "Prompt watcher" page. Lists registered BrandPrompts
 * for the current project plus controls to create / pause / delete them, and
 * a drawer to inspect the last captured LLM answers per prompt. Dashboards
 * (SoV / Citations / AI presence card) land in sub-issue #63.
 */
export const BrandPromptsPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/brand-prompts' });
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [historyPrompt, setHistoryPrompt] = useState<BrandPromptDto | null>(null);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const promptsQuery = useQuery({
		queryKey: ['project', projectId, 'brand-prompts'],
		queryFn: () => api.aiSearch.listPrompts(projectId),
	});

	const togglePause = useMutation({
		mutationFn: (input: { promptId: string; paused: boolean }) =>
			api.aiSearch.pausePrompt(projectId, input.promptId, { paused: input.paused }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'brand-prompts'] });
		},
	});

	const deletePrompt = useMutation({
		mutationFn: (promptId: string) => api.aiSearch.deletePrompt(projectId, promptId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['project', projectId, 'brand-prompts'] });
		},
	});

	if (projectQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const prompts = promptsQuery.data?.items ?? [];

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
							<Sparkles size={20} className="text-primary" />
							AI Brand Radar
						</h1>
						<p className="text-sm text-muted-foreground">
							{projectQuery.data?.name} · prompts monitored across ChatGPT / Claude / Perplexity / Gemini.
						</p>
					</div>
					<Button size="sm" onClick={() => setCreateOpen(true)}>
						<Plus size={14} />
						Track prompt
					</Button>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Prompts ({prompts.length})</CardTitle>
					</CardHeader>
					<CardContent>
						{promptsQuery.isLoading ? (
							<Spinner />
						) : (
							<DataTable
								rows={prompts}
								rowKey={(p) => p.id}
								empty={
									<EmptyState
										title="No prompts tracked yet"
										description="Add the first prompt you want to monitor across LLM-search providers. Daily captures begin at 07:00 UTC after you connect an OpenAI credential."
										action={
											<Button size="sm" onClick={() => setCreateOpen(true)}>
												<Plus size={14} />
												Track prompt
											</Button>
										}
									/>
								}
								columns={[
									{
										key: 'text',
										header: 'Prompt',
										cell: (p) => (
											<button
												type="button"
												onClick={() => setHistoryPrompt(p)}
												className="text-left font-medium hover:underline"
											>
												<span className="line-clamp-2 break-words">{p.text}</span>
											</button>
										),
									},
									{
										key: 'kind',
										header: 'Intent',
										cell: (p) => <Badge variant="secondary">{p.kind}</Badge>,
									},
									{
										key: 'status',
										header: 'Status',
										cell: (p) =>
											p.pausedAt ? (
												<Badge variant="secondary">paused</Badge>
											) : (
												<Badge variant="default">active</Badge>
											),
									},
									{
										key: 'created',
										header: 'Added',
										cell: (p) => (
											<span className="text-xs">{new Date(p.createdAt).toLocaleDateString()}</span>
										),
									},
									{
										key: 'actions',
										header: '',
										cell: (p) => (
											<div className="flex items-center gap-1">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => togglePause.mutate({ promptId: p.id, paused: p.pausedAt === null })}
													disabled={togglePause.isPending}
													title={p.pausedAt ? 'Resume' : 'Pause'}
												>
													{p.pausedAt ? <Play size={14} /> : <Pause size={14} />}
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => {
														if (window.confirm('Delete this prompt? Captured history will be kept.')) {
															deletePrompt.mutate(p.id);
														}
													}}
													disabled={deletePrompt.isPending}
													title="Delete"
												>
													<Trash2 size={14} />
												</Button>
											</div>
										),
									},
								]}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			<AddBrandPromptDrawer projectId={projectId} open={createOpen} onClose={() => setCreateOpen(false)} />
			<BrandPromptHistoryDrawer
				projectId={projectId}
				prompt={historyPrompt}
				onClose={() => setHistoryPrompt(null)}
			/>
		</AppShell>
	);
};
