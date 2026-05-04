import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface EmptyStateProps {
	title: string;
	description?: string;
	action?: ReactNode;
	icon?: ReactNode;
	className?: string;
}

export const EmptyState = ({ title, description, action, icon, className }: EmptyStateProps) => (
	<div
		className={cn(
			'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center',
			className,
		)}
	>
		{icon ? <div className="text-muted-foreground">{icon}</div> : null}
		<h3 className="text-base font-semibold text-foreground">{title}</h3>
		{description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
		{action}
	</div>
);
