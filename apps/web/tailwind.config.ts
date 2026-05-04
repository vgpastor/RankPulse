import type { Config } from 'tailwindcss';

const config: Config = {
	darkMode: 'class',
	content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
	theme: {
		extend: {
			colors: {
				background: 'hsl(var(--rp-bg) / <alpha-value>)',
				foreground: 'hsl(var(--rp-fg) / <alpha-value>)',
				muted: {
					DEFAULT: 'hsl(var(--rp-muted) / <alpha-value>)',
					foreground: 'hsl(var(--rp-muted) / <alpha-value>)',
				},
				card: {
					DEFAULT: 'hsl(var(--rp-card) / <alpha-value>)',
					foreground: 'hsl(var(--rp-fg) / <alpha-value>)',
				},
				border: 'hsl(var(--rp-border) / <alpha-value>)',
				input: 'hsl(var(--rp-input) / <alpha-value>)',
				primary: {
					DEFAULT: 'hsl(var(--rp-primary) / <alpha-value>)',
					foreground: 'hsl(var(--rp-primary-fg) / <alpha-value>)',
				},
				accent: {
					DEFAULT: 'hsl(var(--rp-accent) / <alpha-value>)',
					foreground: 'hsl(var(--rp-accent-fg) / <alpha-value>)',
				},
				destructive: {
					DEFAULT: 'hsl(var(--rp-destructive) / <alpha-value>)',
					foreground: 'hsl(var(--rp-destructive-fg) / <alpha-value>)',
				},
				ring: 'hsl(var(--rp-ring) / <alpha-value>)',
			},
			borderRadius: {
				lg: 'var(--rp-radius)',
				md: 'calc(var(--rp-radius) - 2px)',
				sm: 'calc(var(--rp-radius) - 4px)',
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', 'sans-serif'],
			},
		},
	},
	plugins: [],
};

export default config;
