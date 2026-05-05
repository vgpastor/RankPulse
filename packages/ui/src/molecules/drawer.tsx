import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { cn } from '../lib/cn.js';

export interface DrawerProps {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	children: ReactNode;
	footer?: ReactNode;
}

/**
 * Mobile-first slide-over panel: anchors to the BOTTOM on small screens
 * (rounded top corners, full-width, max 90vh — natural thumb reach), and
 * SLIDES IN FROM THE RIGHT on `md+` (max-width 32rem). Backdrop click and
 * Escape both call `onClose`. Body scroll locked while open.
 */
export const Drawer = ({ open, onClose, title, description, children, footer }: DrawerProps) => {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = previousOverflow;
		};
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-end md:items-stretch"
			role="dialog"
			aria-modal="true"
			aria-labelledby="drawer-title"
		>
			<button
				type="button"
				aria-label="Close drawer"
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>
			<section
				className={cn(
					'relative flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-background shadow-xl',
					'md:h-full md:max-h-none md:max-w-lg md:rounded-none md:rounded-l-2xl',
				)}
			>
				<header className="flex items-start justify-between gap-4 border-b px-5 py-4">
					<div className="flex flex-col gap-1">
						<h2 id="drawer-title" className="text-lg font-semibold tracking-tight">
							{title}
						</h2>
						{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
					</div>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="rounded-md p-1 text-muted-foreground hover:bg-muted/30"
					>
						<X size={18} />
					</button>
				</header>
				<div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
				{footer ? (
					<footer className="flex items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>
				) : null}
			</section>
		</div>
	);
};
