import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
	// biome-ignore lint/a11y/noLabelWithoutControl: this is a generic <label> primitive — callers wire the htmlFor association.
	<label
		ref={ref}
		className={cn(
			'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
			className,
		)}
		{...props}
	/>
));
Label.displayName = 'Label';
