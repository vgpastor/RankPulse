import { eq } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { DrizzleDatabase } from '../client.js';

/**
 * Base class for Drizzle repositories that exposes the universal
 * `findById` pattern. Subclasses MUST implement `toAggregate(row)` to
 * convert a row to the bounded-context aggregate.
 *
 * Save, delete, and complex queries stay in subclasses — they often need
 * `ON CONFLICT DO UPDATE`, projections, or time-series filters that are
 * specific to each aggregate's schema.
 *
 * The `table` parameter is typed broadly (AnyPgTable) so subclasses can
 * pass any table; runtime relies on the table having an `id` column with
 * a `.name` of `'id'`.
 *
 * See ADR 0002 for the rationale (38 repos shared this pattern).
 */
export abstract class DrizzleRepository<TAggregate, TRow extends { id: string }> {
	constructor(
		protected readonly db: DrizzleDatabase,
		protected readonly table: AnyPgTable,
	) {}

	async findById(id: string): Promise<TAggregate | null> {
		const idColumn = (this.table as unknown as { id: { name: string } }).id;
		const rows = await this.db.select().from(this.table).where(eq(idColumn as never, id)).limit(1);
		const row = rows[0] as TRow | undefined;
		return row ? this.toAggregate(row) : null;
	}

	protected abstract toAggregate(row: TRow): TAggregate;
}
