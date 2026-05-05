import { defineConfig } from 'vitest/config';

export default defineConfig({
	// BACKLOG #16 — match the per-package vitest configs so cross-package
	// imports (@rankpulse/domain, @rankpulse/provider-dataforseo, …)
	// resolve to src/ in tests without requiring a prior `pnpm build`.
	resolve: { conditions: ['development', 'module', 'import', 'default'] },
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
	},
});
