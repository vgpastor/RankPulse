import { defineConfig } from 'vitest/config';

export default defineConfig({
	// BACKLOG #16 — packages declare dual exports (development/default).
	// Without this, vitest resolves cross-package imports via `default` →
	// `./dist/index.js` and tests fail in clean checkouts before any
	// `pnpm build`. The `development` condition matches the same map TS
	// uses for `customConditions` in tsconfig.base.json.
	resolve: { conditions: ['development', 'module', 'import', 'default'] },
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/**/index.ts'],
		},
	},
});
