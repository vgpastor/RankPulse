import { type ReactNode, useEffect } from 'react';

export interface ModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
}

/**
 * Centered dialog for confirmations and short flows. Mobile-first: full-bleed
 * with margin on small screens, capped to max-width on `md+`. Backdrop click
 * and Escape close it; body scroll locked while open.
 */
export const Modal = ({ open, onClose, title, children, footer }: ModalProps) => {
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
			className="fixed inset-0 z-50 flex items-center justify-center px-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<button
				type="button"
				aria-label="Close modal"
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>
			<section className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-background p-5 shadow-xl">
				<h2 id="modal-title" className="text-lg font-semibold tracking-tight">
					{title}
				</h2>
				<div className="text-sm text-muted-foreground">{children}</div>
				{footer ? <div className="flex items-center justify-end gap-2">{footer}</div> : null}
			</section>
		</div>
	);
};
