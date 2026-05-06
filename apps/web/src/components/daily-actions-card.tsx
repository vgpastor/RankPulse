import type { ProjectManagementContracts } from '@rankpulse/contracts';
import type { ProjectRankingItem } from '@rankpulse/sdk';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Bell } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionKind = 'serp-drop' | 'quick-win' | 'competitor-overtake' | 'gap-opportunity';

export interface DailyAction {
	id: string;
	kind: ActionKind;
	priority: ActionPriority;
	emoji: string;
	titleKey: string;
	titleVars: Record<string, string | number>;
	cta: { to: string; params: Record<string, string>; labelKey: string };
}

const PRIORITY_ORDER: Record<ActionPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const buildActions = (
	rankings: readonly ProjectRankingItem[],
	project: ProjectManagementContracts.ProjectDto,
): DailyAction[] => {
	const ownDomains = new Set(project.domains.map((d) => d.domain));
	const grouped = new Map<string, ProjectRankingItem[]>();
	for (const r of rankings) {
		const cur = grouped.get(r.trackedKeywordId) ?? [];
		cur.push(r);
		grouped.set(r.trackedKeywordId, cur);
	}

	const yesterday = new Date();
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	const yesterdayIso = yesterday.toISOString();
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
	const sevenIso = sevenDaysAgo.toISOString();

	const out: DailyAction[] = [];

	for (const items of grouped.values()) {
		const sorted = [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
		const latest = sorted[sorted.length - 1];
		if (!latest || !ownDomains.has(latest.domain)) continue;

		const before = [...sorted].reverse().find((r) => r.observedAt < sevenIso);
		if (latest.position !== null && before?.position && latest.position > before.position + 5) {
			out.push({
				id: `drop-${latest.trackedKeywordId}`,
				kind: 'serp-drop',
				priority: 'critical',
				emoji: '❗',
				titleKey: 'actions.serpDrop',
				titleVars: { phrase: latest.phrase, from: before.position, to: latest.position },
				cta: {
					to: '/projects/$id/rankings',
					params: { id: project.id },
					labelKey: 'actions.cta.investigate',
				},
			});
			continue;
		}

		if (latest.position !== null && latest.position >= 11 && latest.position <= 13) {
			out.push({
				id: `qw-${latest.trackedKeywordId}`,
				kind: 'quick-win',
				priority: 'high',
				emoji: '📈',
				titleKey: 'actions.quickWin',
				titleVars: { phrase: latest.phrase, position: latest.position },
				cta: {
					to: '/projects/$id/opportunities',
					params: { id: project.id },
					labelKey: 'actions.cta.push',
				},
			});
		}
	}

	const competitorOvertake = new Map<string, { phrase: string; ourPos: number; theirPos: number }>();
	const latestPerKwDomain = new Map<string, ProjectRankingItem>();
	for (const r of rankings) {
		if (r.observedAt < yesterdayIso) continue;
		const key = `${r.phrase}::${r.domain}`;
		const cur = latestPerKwDomain.get(key);
		if (!cur || r.observedAt > cur.observedAt) latestPerKwDomain.set(key, r);
	}
	const byKeyword = new Map<string, ProjectRankingItem[]>();
	for (const r of latestPerKwDomain.values()) {
		const cur = byKeyword.get(r.phrase) ?? [];
		cur.push(r);
		byKeyword.set(r.phrase, cur);
	}
	for (const [phrase, items] of byKeyword.entries()) {
		const ours = items.filter((r) => ownDomains.has(r.domain) && r.position !== null);
		const theirs = items.filter((r) => !ownDomains.has(r.domain) && r.position !== null);
		if (ours.length === 0 || theirs.length === 0) continue;
		const ourBest = ours.reduce<ProjectRankingItem | null>(
			(acc, r) => (acc === null || (r.position ?? 999) < (acc.position ?? 999) ? r : acc),
			null,
		);
		const theirBest = theirs.reduce<ProjectRankingItem | null>(
			(acc, r) => (acc === null || (r.position ?? 999) < (acc.position ?? 999) ? r : acc),
			null,
		);
		if (
			ourBest &&
			theirBest &&
			ourBest.position !== null &&
			theirBest.position !== null &&
			theirBest.position < ourBest.position
		) {
			competitorOvertake.set(phrase, {
				phrase,
				ourPos: ourBest.position,
				theirPos: theirBest.position,
			});
		}
	}

	for (const v of competitorOvertake.values()) {
		out.push({
			id: `overtake-${v.phrase}`,
			kind: 'competitor-overtake',
			priority: 'high',
			emoji: '🥊',
			titleKey: 'actions.competitorOvertake',
			titleVars: { phrase: v.phrase, ourPos: v.ourPos, theirPos: v.theirPos },
			cta: {
				to: '/projects/$id/competitors',
				params: { id: project.id },
				labelKey: 'actions.cta.audit',
			},
		});
	}

	return out.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]).slice(0, 3);
};

export interface DailyActionsCardProps {
	project: ProjectManagementContracts.ProjectDto;
}

export const DailyActionsCard = ({ project }: DailyActionsCardProps) => {
	const { t } = useTranslation('dailyActions');
	const rankingsQuery = useQuery({
		queryKey: ['project', project.id, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(project.id),
	});

	const actions = useMemo(
		() => buildActions(rankingsQuery.data ?? [], project),
		[rankingsQuery.data, project],
	);

	if (rankingsQuery.isLoading) return null;
	if (actions.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Bell size={14} className="text-primary" />
						{t('title')}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">{t('empty')}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="flex items-center gap-2 text-base">
					<Bell size={14} className="text-primary" />
					{t('title')}
				</CardTitle>
				<Link to="/projects/$id/actions" params={{ id: project.id }}>
					<Button variant="ghost" size="sm">
						{t('seeAll')}
						<ArrowRight size={14} />
					</Button>
				</Link>
			</CardHeader>
			<CardContent>
				<ul className="flex flex-col gap-3 text-sm">
					{actions.map((action) => (
						<li
							key={action.id}
							className="flex flex-col gap-2 rounded border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="flex items-start gap-2">
								<span aria-hidden className="text-lg">
									{action.emoji}
								</span>
								<div className="min-w-0 flex-1">
									<p className="break-words font-medium">{t(action.titleKey, action.titleVars)}</p>
									<Badge
										variant={
											action.priority === 'critical'
												? 'destructive'
												: action.priority === 'high'
													? 'warning'
													: 'secondary'
										}
										className="mt-1"
									>
										{t(`priority.${action.priority}`)}
									</Badge>
								</div>
							</div>
							<Link to={action.cta.to} params={action.cta.params}>
								<Button variant="secondary" size="sm">
									{t(action.cta.labelKey)}
									<ArrowRight size={14} />
								</Button>
							</Link>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
};
