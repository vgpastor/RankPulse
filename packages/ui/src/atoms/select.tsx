import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
	<select
		ref={ref}
		className={cn(
			'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
			className,
		)}
		{...props}
	>
		{children}
	</select>
));
Select.displayName = 'Select';
