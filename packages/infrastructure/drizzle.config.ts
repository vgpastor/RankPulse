import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/persistence/drizzle/schema/index.ts',
	out: './src/persistence/drizzle/migrations',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'postgres://rankpulse:rankpulse@localhost:5432/rankpulse',
	},
	verbose: true,
	strict: true,
});
