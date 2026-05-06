import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import { Badge, Button, Drawer, EmptyState, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export interface BrandPromptHistoryDrawerProps {
	projectId: string;
	prompt: AiSearchInsightsContracts.BrandPromptDtoSchema | null;
	onClose: () => void;
}

/**
 * Read-only drawer that lists the last 20 captured LlmAnswers for a single
 * BrandPrompt, grouped under provider × locale headings. Each answer shows
 * the raw text, the extracted mentions (own brand highlighted) and the
 * cited URLs (own domains highlighted). For sub-issue #63 (dashboards) the
 * raw text rendering will get inline mention highlighting; for #61 we keep
 * the bare list.
 */
export const BrandPromptHistoryDrawer = ({ projectId, prompt, onClose }: BrandPromptHistoryDrawerProps) => {
	const open = prompt !== null;
	const promptId = prompt?.id ?? '';
	const answersQuery = useQuery({
		queryKey: ['project', projectId, 'brand-prompts', promptId, 'answers'],
		queryFn: () => api.aiSearch.listAnswersForPrompt(projectId, promptId, { limit: 20 }),
		enabled: open && promptId.length > 0,
		// Captures only land once a day (07:00 UTC); a 5-min stale window
		// avoids re-fetching when the user opens / closes the drawer twice
		// in a row, while still picking up new captures on the next session.
		staleTime: 5 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
	});

	return (
		<Drawer
			open={open}
			onClose={onClose}
			title={
				prompt ? `Captures · ${prompt.text.slice(0, 60)}${prompt.text.length > 60 ? '…' : ''}` : 'Captures'
			}
			footer={
				<Button variant="ghost" type="button" onClick={onClose}>
					Close
				</Button>
			}
		>
			{!prompt ? null : answersQuery.isLoading ? (
				<div className="py-6 text-center">
					<Spinner />
				</div>
			) : (answersQuery.data?.items.length ?? 0) === 0 ? (
				<EmptyState
					title="No captures yet"
					description="The first run is scheduled for 07:00 UTC. Connect an OpenAI credential and add at least one location to the project before then."
				/>
			) : (
				<ul className="flex flex-col gap-4">
					{(answersQuery.data?.items ?? []).map((answer) => (
						<li key={answer.id} className="rounded-md border border-border p-4">
							<header className="mb-3 flex flex-wrap items-center gap-2 text-xs">
								<Badge variant="secondary">{answer.aiProvider}</Badge>
								<Badge variant="secondary">{answer.model}</Badge>
								<Badge variant="secondary">
									{answer.country.toLowerCase()}-{answer.language}
								</Badge>
								<span className="text-muted-foreground">{new Date(answer.capturedAt).toLocaleString()}</span>
								<span className="ml-auto text-muted-foreground">${(answer.costCents / 100).toFixed(3)}</span>
							</header>
							{answer.mentions.length > 0 ? (
								<div className="mb-3 flex flex-wrap gap-1">
									{answer.mentions.map((m) => (
										<Badge
											key={`${answer.id}-${m.brand}`}
											variant={m.position === 1 ? 'default' : 'secondary'}
											title={`Position ${m.position} · ${m.sentiment}`}
										>
											#{m.position} {m.brand}
										</Badge>
									))}
								</div>
							) : null}
							<p className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
								{answer.rawText}
							</p>
							{answer.citations.length > 0 ? (
								<details className="text-xs text-muted-foreground">
									<summary className="cursor-pointer">{answer.citations.length} citations</summary>
									<ul className="mt-2 flex flex-col gap-1">
										{answer.citations.map((c) => (
											<li key={`${answer.id}-${c.url}`}>
												<a
													href={c.url}
													target="_blank"
													rel="noreferrer"
													className={c.isOwnDomain ? 'font-medium text-primary' : ''}
												>
													{c.domain}
												</a>{' '}
												<span className="break-all">{c.url}</span>
											</li>
										))}
									</ul>
								</details>
							) : null}
						</li>
					))}
				</ul>
			)}
		</Drawer>
	);
};
