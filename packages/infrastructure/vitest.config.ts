import { defineConfig } from 'vitest/config';

export default defineConfig({
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
