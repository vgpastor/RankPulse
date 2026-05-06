import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkline } from '../atoms/sparkline.js';
import { cn } from '../lib/cn.js';

export type KpiTrend = 'up' | 'down' | 'flat';
export type KpiTrendIntent = 'positive' | 'negative' | 'neutral';

export interface KpiCardProps {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	icon?: ReactNode;
	delta?: {
		value: string;
		trend: KpiTrend;
		intent?: KpiTrendIntent;
	};
	sparkline?: {
		values: readonly number[];
		ariaLabel?: string;
	};
	loading?: boolean;
	onClick?: () => void;
	href?: string;
	className?: string;
}

const TREND_ICON: Record<KpiTrend, typeof ArrowUpRight> = {
	up: ArrowUpRight,
	down: ArrowDownRight,
	flat: ArrowRight,
};

const intentClass = (trend: KpiTrend, intent: KpiTrendIntent | undefined): string => {
	const resolved: KpiTrendIntent =
		intent ?? (trend === 'up' ? 'positive' : trend === 'down' ? 'negative' : 'neutral');
	if (resolved === 'positive') return 'text-emerald-600';
	if (resolved === 'negative') return 'text-destructive';
	return 'text-muted-foreground';
};

const sparklineColor = (trend: KpiTrend | undefined, intent: KpiTrendIntent | undefined): string => {
	if (!trend) return 'oklch(var(--primary))';
	const resolved: KpiTrendIntent =
		intent ?? (trend === 'up' ? 'positive' : trend === 'down' ? 'negative' : 'neutral');
	if (resolved === 'positive') return '#10b981';
	if (resolved === 'negative') return '#ef4444';
	return '#94a3b8';
};

export const KpiCard = ({
	label,
	value,
	hint,
	icon,
	delta,
	sparkline,
	loading,
	onClick,
	href,
	className,
}: KpiCardProps) => {
	const interactive = Boolean(onClick || href);
	const TrendIcon = delta ? TREND_ICON[delta.trend] : null;
	const sparkColor = sparklineColor(delta?.trend, delta?.intent);

	const inner = (
		<div
			className={cn(
				'flex h-full min-h-28 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 text-foreground shadow-sm transition-colors',
				interactive &&
					'cursor-pointer hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
				className,
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
				{icon ? <span className="text-muted-foreground">{icon}</span> : null}
			</div>
			<div className="flex flex-1 flex-col gap-1">
				<span className="text-2xl font-semibold leading-tight tabular-nums sm:text-3xl">
					{loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-muted/50" /> : value}
				</span>
				{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
			</div>
			<div className="flex items-end justify-between gap-2">
				{delta && TrendIcon ? (
					<span
						className={cn(
							'inline-flex items-center gap-1 text-xs font-medium',
							intentClass(delta.trend, delta.intent),
						)}
					>
						<TrendIcon size={12} />
						{delta.value}
					</span>
				) : (
					<span />
				)}
				{sparkline ? (
					<div className="h-8 w-24 sm:w-28" style={{ color: sparkColor }}>
						<Sparkline
							values={sparkline.values}
							stroke={sparkColor}
							fill={sparkColor}
							aria-label={sparkline.ariaLabel}
						/>
					</div>
				) : null}
			</div>
		</div>
	);

	if (href) {
		return (
			<a href={href} className="block h-full focus-visible:outline-none">
				{inner}
			</a>
		);
	}
	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className="block h-full w-full text-left focus-visible:outline-none"
			>
				{inner}
			</button>
		);
	}
	return inner;
};
