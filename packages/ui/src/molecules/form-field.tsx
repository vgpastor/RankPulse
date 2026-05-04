import { type ReactNode, useId } from 'react';
import { Label } from '../atoms/label.js';
import { cn } from '../lib/cn.js';

export interface FormFieldProps {
	label: string;
	hint?: string;
	error?: string;
	children: (id: string) => ReactNode;
	className?: string;
}

export const FormField = ({ label, hint, error, children, className }: FormFieldProps) => {
	const id = useId();
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<Label htmlFor={id}>{label}</Label>
			{children(id)}
			{error ? (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			) : hint ? (
				<p className="text-xs text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
};
