import { Loader2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
	size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
	sm: 'h-3 w-3',
	md: 'h-4 w-4',
	lg: 'h-6 w-6',
};

export const Spinner = ({ size = 'md', className, ...props }: SpinnerProps) => (
	<output aria-live="polite" className={cn('inline-flex', className)} {...props}>
		<Loader2 className={cn('animate-spin text-muted-foreground', SIZE_CLASS[size])} />
		<span className="sr-only">Loading…</span>
	</output>
);
