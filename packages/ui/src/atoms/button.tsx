import { type VariantProps, cva } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn.js';

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
				secondary: 'bg-card text-foreground border border-border hover:bg-muted/30',
				ghost: 'bg-transparent text-foreground hover:bg-muted/30',
				accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
			},
			size: {
				sm: 'h-8 px-3 text-xs',
				md: 'h-9 px-4',
				lg: 'h-10 px-5 text-base',
				icon: 'h-9 w-9',
			},
		},
		defaultVariants: {
			variant: 'primary',
			size: 'md',
		},
	},
);

export interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, ...props }, ref) => (
		<button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
	),
);
Button.displayName = 'Button';

export { buttonVariants };
