import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, LinkIcon, Trophy } from 'lucide-react';
import { api } from '../lib/api.js';

export interface AiAlertsPanelProps {
	projectId: string;
}

const KIND_META: Record<
	AiSearchInsightsContracts.AiSearchAlertKindContract,
	{ label: string; icon: typeof AlertTriangle }
> = {
	BrandLostCitation: { label: 'Citation lost', icon: LinkIcon },
	BrandSoVDropped: { label: 'SoV dropped', icon: ArrowDownRight },
	CompetitorOvertook: { label: 'Competitor ahead', icon: Trophy },
};

const SEVERITY_VARIANT: Record<
	AiSearchInsightsContracts.AiSearchAlertSeverityContract,
	'destructive' | 'warning' | 'secondary'
> = {
	critical: 'destructive',
	warning: 'warning',
	info: 'secondary',
};

const formatPercent = (value: unknown): string => {
	if (typeof value !== 'number') return '—';
	return `${(value * 100).toFixed(1)}%`;
};

const describeAlert = (alert: AiSearchInsightsContracts.AiSearchAlertItem): string => {
	switch (alert.kind) {
		case 'BrandLostCitation':
			return `${alert.subject} — was cited ${alert.details.streakDays}d in a row, gone today`;
		case 'BrandSoVDropped':
			return `${formatPercent(alert.details.thisWeekRate)} this week vs ${formatPercent(alert.details.lastWeekRate)} last week (${formatPercent(alert.details.relativeDelta)} change)`;
		case 'CompetitorOvertook':
			return `${alert.subject} avg pos ${typeof alert.details.competitorAvgPosition === 'number' ? alert.details.competitorAvgPosition.toFixed(1) : '—'} vs your ${typeof alert.details.ownAvgPosition === 'number' ? alert.details.ownAvgPosition.toFixed(1) : '—'}`;
	}
};

/**
 * Sub-issue #64 of #27 — alerts panel. Listed on the project home below the
 * AI presence card. Empty state is welcome news, not a graveyard.
 */
export const AiAlertsPanel = ({ projectId }: AiAlertsPanelProps) => {
	const alertsQuery = useQuery({
		queryKey: ['project', projectId, 'ai-search', 'alerts'],
		queryFn: () => api.aiSearch.alerts(projectId),
		staleTime: 5 * 60 * 1000,
	});

	const items = alertsQuery.data?.items ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<AlertTriangle size={16} className={items.length > 0 ? 'text-warning' : 'text-muted-foreground'} />
					AI alerts ({items.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				{alertsQuery.isLoading ? (
					<div className="flex justify-center py-4">
						<Spinner />
					</div>
				) : items.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No regressions detected. Citations stable, SoV holding up, no competitor leading.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{items.map((alert) => {
							const Icon = KIND_META[alert.kind].icon;
							return (
								<li
									key={`${alert.kind}-${alert.aiProvider}-${alert.country}-${alert.language}-${alert.subject}`}
									className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
								>
									<Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
									<div className="flex flex-1 flex-col gap-1">
										<div className="flex flex-wrap items-center gap-2">
											<Badge variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</Badge>
											<span className="font-medium">{KIND_META[alert.kind].label}</span>
											<Badge variant="secondary">{alert.aiProvider}</Badge>
											<Badge variant="secondary">
												{alert.country.toLowerCase()}-{alert.language}
											</Badge>
										</div>
										<p className="text-muted-foreground">{describeAlert(alert)}</p>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
};
