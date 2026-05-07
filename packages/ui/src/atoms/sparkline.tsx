import { useId } from 'react';
import { cn } from '../lib/cn.js';

export interface SparklineProps {
	values: readonly number[];
	className?: string;
	stroke?: string;
	fill?: string;
	strokeWidth?: number;
	height?: number;
	'aria-label'?: string;
}

export const Sparkline = ({
	values,
	className,
	stroke = 'currentColor',
	fill,
	strokeWidth = 1.5,
	height = 32,
	'aria-label': ariaLabel,
}: SparklineProps) => {
	const gradientId = useId();
	if (values.length < 2) {
		return (
			<svg
				viewBox={`0 0 100 ${height}`}
				preserveAspectRatio="none"
				className={cn('h-8 w-full', className)}
				aria-hidden={!ariaLabel}
				role={ariaLabel ? 'img' : undefined}
				aria-label={ariaLabel}
			>
				<line
					x1={0}
					y1={height / 2}
					x2={100}
					y2={height / 2}
					stroke="currentColor"
					strokeOpacity={0.2}
					strokeWidth={1}
					strokeDasharray="2 2"
				/>
			</svg>
		);
	}

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const stepX = 100 / (values.length - 1);
	const points = values.map((value, index) => {
		const x = index * stepX;
		const y = height - ((value - min) / range) * (height - strokeWidth * 2) - strokeWidth;
		return [x, y] as const;
	});
	const linePath = points
		.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
		.join(' ');
	const lastPoint = points.at(-1) ?? [100, height / 2];
	const firstPoint = points[0] ?? [0, height / 2];
	const fillPath = `${linePath} L${lastPoint[0].toFixed(2)},${height} L${firstPoint[0].toFixed(2)},${height} Z`;

	return (
		<svg
			viewBox={`0 0 100 ${height}`}
			preserveAspectRatio="none"
			className={cn('h-8 w-full', className)}
			aria-hidden={!ariaLabel}
			role={ariaLabel ? 'img' : undefined}
			aria-label={ariaLabel}
		>
			{fill ? (
				<>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={fill} stopOpacity={0.4} />
							<stop offset="100%" stopColor={fill} stopOpacity={0} />
						</linearGradient>
					</defs>
					<path d={fillPath} fill={`url(#${gradientId})`} />
				</>
			) : null}
			<path
				d={linePath}
				fill="none"
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};
