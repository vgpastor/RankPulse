import { type VariantProps, cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

const badgeVariants = cva(
	'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
	{
		variants: {
			variant: {
				default: 'bg-primary/10 text-primary border border-primary/20',
				secondary: 'bg-muted/30 text-foreground border border-border',
				success: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
				warning: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
				destructive: 'bg-destructive/10 text-destructive border border-destructive/20',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
	<span className={cn(badgeVariants({ variant, className }))} {...props} />
);
