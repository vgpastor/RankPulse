import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: { conditions: ['development', 'module', 'import', 'default'] },
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
	},
});
