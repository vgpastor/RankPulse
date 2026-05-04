import { type PostgresJsDatabase, drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index.js';

export type DrizzleDatabase = PostgresJsDatabase<typeof schema>;

export interface CreateClientOptions {
	connectionString: string;
	maxConnections?: number;
	debug?: boolean;
}

export interface DrizzleClient {
	db: DrizzleDatabase;
	sql: Sql;
	close(): Promise<void>;
}

export function createDrizzleClient(options: CreateClientOptions): DrizzleClient {
	const sql = postgres(options.connectionString, {
		max: options.maxConnections ?? 10,
		prepare: false,
		debug: options.debug ?? false,
	});
	const db = drizzle(sql, { schema });
	return {
		db,
		sql,
		async close() {
			await sql.end({ timeout: 5 });
		},
	};
}

export { schema };
