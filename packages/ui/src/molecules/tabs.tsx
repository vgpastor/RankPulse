import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface TabItem {
	id: string;
	label: string;
	/** Optional ReactNode rendered before the label (e.g. icon). */
	icon?: ReactNode;
}

export interface TabsProps {
	tabs: readonly TabItem[];
	activeId: string;
	onChange: (id: string) => void;
	/** Optional aria-label used by both the desktop tablist and the mobile select. */
	ariaLabel?: string;
	className?: string;
}

/**
 * Mobile-first tabs.
 *
 * Below `sm:`, a `<select>` is rendered to save vertical space; from `sm:` and
 * upwards, a horizontal tablist is rendered. The component is uncontrolled-ish:
 * the parent owns `activeId` and reacts to `onChange`. Tab panels are NOT
 * rendered here — the consumer renders the active panel based on `activeId`.
 */
export const Tabs = ({ tabs, activeId, onChange, ariaLabel, className }: TabsProps) => {
	return (
		<div className={cn('w-full', className)}>
			{/* Mobile: native select keeps the page short on small screens. */}
			<div className="sm:hidden">
				<label className="sr-only" htmlFor="tabs-mobile-select">
					{ariaLabel ?? 'Tabs'}
				</label>
				<select
					id="tabs-mobile-select"
					value={activeId}
					onChange={(e) => onChange(e.target.value)}
					className="flex h-11 min-h-11 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{tabs.map((tab) => (
						<option key={tab.id} value={tab.id}>
							{tab.label}
						</option>
					))}
				</select>
			</div>

			{/* sm+: tablist */}
			<div
				role="tablist"
				aria-label={ariaLabel}
				className="hidden flex-wrap gap-1 border-b border-border sm:flex"
			>
				{tabs.map((tab) => {
					const isActive = tab.id === activeId;
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={isActive}
							aria-controls={`tab-panel-${tab.id}`}
							id={`tab-${tab.id}`}
							onClick={() => onChange(tab.id)}
							className={cn(
								'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
								isActive
									? 'border-primary text-foreground'
									: 'border-transparent text-muted-foreground hover:text-foreground',
							)}
						>
							{tab.icon}
							{tab.label}
						</button>
					);
				})}
			</div>
		</div>
	);
};
