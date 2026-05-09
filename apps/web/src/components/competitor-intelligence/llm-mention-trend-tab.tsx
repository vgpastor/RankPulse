import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart as ReLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { api } from '../../lib/api.js';

type LlmAnswer = AiSearchInsightsContracts.LlmAnswerDtoSchema;
type RangePreset = '7d' | '28d' | '90d';

const RANGE_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90 };

const TOP_N = 5;

// Stable color palette so each competitor brand keeps its line color across
// renders. Cycles by index — top-5 will always fit.
const LINE_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

interface LlmMentionTrendTabProps {
	projectId: string;
}

interface DailyRow {
	day: string;
	[brand: string]: string | number;
}

export const LlmMentionTrendTab = ({ projectId }: LlmMentionTrendTabProps) => {
	const { t } = useTranslation('competitorIntelligence');
	const [range, setRange] = useState<RangePreset>('28d');

	const answersQuery = useQuery({
		queryKey: ['competitor-intelligence', projectId, 'llm-answers', RANGE_DAYS[range]],
		queryFn: () => api.aiSearch.listAnswersForProject(projectId, { limit: 500 }),
		staleTime: 60_000,
	});

	const filtered = useMemo<LlmAnswer[]>(() => {
		const items = answersQuery.data?.items ?? [];
		const cutoff = new Date();
		cutoff.setUTCDate(cutoff.getUTCDate() - RANGE_DAYS[range]);
		const cutoffIso = cutoff.toISOString();
		return items.filter((a) => a.capturedAt >= cutoffIso);
	}, [answersQuery.data, range]);

	// Top-5 brands by total mentions in the window. We deliberately skip
	// `isOwnBrand` because the page is "competitor intelligence" — own brand
	// has its own widget on /ai-radar.
	const topBrands = useMemo(() => {
		const counts = new Map<string, number>();
		for (const answer of filtered) {
			const seen = new Set<string>();
			for (const m of answer.mentions) {
				if (m.isOwnBrand) continue;
				if (seen.has(m.brand)) continue;
				seen.add(m.brand);
				counts.set(m.brand, (counts.get(m.brand) ?? 0) + 1);
			}
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_N)
			.map(([brand]) => brand);
	}, [filtered]);

	const timeline = useMemo<DailyRow[]>(() => {
		if (topBrands.length === 0) return [];
		const buckets = new Map<string, DailyRow>();
		for (const answer of filtered) {
			const day = answer.capturedAt.slice(0, 10);
			const cur =
				buckets.get(day) ?? ({ day, ...Object.fromEntries(topBrands.map((b) => [b, 0])) } as DailyRow);
			const seen = new Set<string>();
			for (const m of answer.mentions) {
				if (m.isOwnBrand) continue;
				if (!topBrands.includes(m.brand)) continue;
				if (seen.has(m.brand)) continue;
				seen.add(m.brand);
				cur[m.brand] = (cur[m.brand] as number) + 1;
			}
			buckets.set(day, cur);
		}
		return [...buckets.values()].sort((a, b) => (a.day as string).localeCompare(b.day as string));
	}, [filtered, topBrands]);

	if (answersQuery.isLoading) {
		return (
			<div className="flex justify-center py-10">
				<Spinner size="lg" />
			</div>
		);
	}

	if (answersQuery.isError) {
		return (
			<EmptyState
				icon={<Sparkles size={32} />}
				title={t('errorTitle')}
				description={(answersQuery.error as Error | undefined)?.message ?? ''}
				action={
					<Button onClick={() => answersQuery.refetch()} className="min-h-11 min-w-11">
						{t('retry')}
					</Button>
				}
			/>
		);
	}

	if (filtered.length === 0 || topBrands.length === 0) {
		return (
			<EmptyState
				icon={<Sparkles size={32} />}
				title={t('llmMentionTrend.empty')}
				description={t('llmMentionTrend.emptyDescription')}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="text-base">{t('llmMentionTrend.title')}</CardTitle>
							<p className="text-xs text-muted-foreground">{t('llmMentionTrend.subtitle')}</p>
						</div>
						<div className="flex flex-wrap gap-1" role="tablist" aria-label={t('llmMentionTrend.rangeLabel')}>
							{(['7d', '28d', '90d'] as RangePreset[]).map((preset) => (
								<Button
									key={preset}
									type="button"
									size="sm"
									variant={range === preset ? 'primary' : 'secondary'}
									onClick={() => setRange(preset)}
									aria-pressed={range === preset}
									className="min-h-11 min-w-11"
								>
									{t(`llmMentionTrend.range.${preset}`)}
								</Button>
							))}
						</div>
					</div>
				</CardHeader>
				<CardContent className="h-72 sm:h-96">
					<ResponsiveContainer width="100%" height="100%">
						<ReLineChart data={timeline} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="day" tick={{ fontSize: 11 }} />
							<YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
							<Tooltip />
							<Legend />
							{topBrands.map((brand, i) => (
								<Line
									key={brand}
									type="monotone"
									dataKey={brand}
									stroke={LINE_COLORS[i % LINE_COLORS.length]}
									strokeWidth={2}
									dot={{ r: 2 }}
								/>
							))}
						</ReLineChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>
			<p className="text-xs text-muted-foreground">{t('llmMentionTrend.chartHint')}</p>
		</div>
	);
};
