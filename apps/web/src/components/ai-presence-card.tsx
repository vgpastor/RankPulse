import { Badge, Card, CardContent, CardHeader, CardTitle, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';

export interface AiPresenceCardProps {
	projectId: string;
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatPosition = (value: number | null): string => (value === null ? '—' : value.toFixed(1));

/**
 * Sub-issue #63 of #27 — headline metrics card for the project home page.
 * Last 7 days by default. Renders three KPIs (mention rate, citation count,
 * average own position) plus a quick link into the citations page.
 *
 * Empty state when `totalAnswers === 0`: nudges the user toward connecting
 * an AI provider / adding the first BrandPrompt rather than dropping them
 * into a "0%" graveyard.
 */
export const AiPresenceCard = ({ projectId }: AiPresenceCardProps) => {
	const presenceQuery = useQuery({
		queryKey: ['project', projectId, 'ai-search', 'presence'],
		queryFn: () => api.aiSearch.presence(projectId),
		staleTime: 5 * 60 * 1000,
	});

	const data = presenceQuery.data;
	const empty = !presenceQuery.isLoading && (data?.totalAnswers ?? 0) === 0;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="flex items-center gap-2 text-base">
					<Sparkles size={16} className="text-primary" />
					AI presence (7d)
				</CardTitle>
				<Link
					to="/projects/$id/brand-prompts"
					params={{ id: projectId }}
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					Manage prompts <ArrowRight size={12} className="inline" />
				</Link>
			</CardHeader>
			<CardContent>
				{presenceQuery.isLoading ? (
					<div className="flex justify-center py-4">
						<Spinner />
					</div>
				) : empty ? (
					<p className="text-sm text-muted-foreground">
						No captures yet. Connect an LLM provider and add a BrandPrompt — the first daily run lands at
						07:00 UTC.
					</p>
				) : data ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div>
							<div className="text-xs uppercase tracking-wide text-muted-foreground">Mention rate</div>
							<div className="mt-1 text-2xl font-semibold tracking-tight">
								{formatPercent(data.mentionRate)}
							</div>
							<div className="text-xs text-muted-foreground">
								{data.answersWithOwnMention} / {data.totalAnswers} answers
							</div>
						</div>
						<div>
							<div className="text-xs uppercase tracking-wide text-muted-foreground">Citations</div>
							<div className="mt-1 text-2xl font-semibold tracking-tight">{data.ownCitationCount}</div>
							<div className="text-xs text-muted-foreground">
								<Link
									to="/projects/$id/ai-search/citations"
									params={{ id: projectId }}
									className="hover:underline"
								>
									View citations
								</Link>
							</div>
						</div>
						<div>
							<div className="text-xs uppercase tracking-wide text-muted-foreground">Avg own position</div>
							<div className="mt-1 text-2xl font-semibold tracking-tight">
								{formatPosition(data.ownAvgPosition)}
							</div>
							<div className="text-xs text-muted-foreground">
								{data.competitorMentionCount > 0 ? (
									<Badge variant="secondary">{data.competitorMentionCount} competitor mentions</Badge>
								) : (
									'no competitor mentions'
								)}
							</div>
						</div>
					</div>
				) : (
					<p className="text-sm text-destructive">Couldn't load AI presence.</p>
				)}
			</CardContent>
		</Card>
	);
};
