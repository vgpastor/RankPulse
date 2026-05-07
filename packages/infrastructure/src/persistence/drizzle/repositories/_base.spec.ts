import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDatabase } from '../client.js';
import { DrizzleRepository } from './_base.js';

interface FakeRow {
	readonly id: string;
	readonly name: string;
}

interface FakeAggregate {
	readonly id: string;
	readonly name: string;
}

class FakeRepo extends DrizzleRepository<FakeAggregate, FakeRow> {
	protected toAggregate(row: FakeRow): FakeAggregate {
		return { id: row.id, name: row.name };
	}
}

describe('DrizzleRepository.findById', () => {
	it('returns null when no row matches', async () => {
		const limit = vi.fn().mockResolvedValue([]);
		const where = vi.fn(() => ({ limit }));
		const from = vi.fn(() => ({ where }));
		const select = vi.fn(() => ({ from }));
		const db = { select } as unknown as DrizzleDatabase;
		const table = { id: { name: 'id' } } as unknown as AnyPgTable;
		const repo = new FakeRepo(db, table);
		await expect(repo.findById('nope')).resolves.toBeNull();
	});

	it('returns mapped aggregate when row matches', async () => {
		const limit = vi.fn().mockResolvedValue([{ id: 'a', name: 'Alpha' }]);
		const where = vi.fn(() => ({ limit }));
		const from = vi.fn(() => ({ where }));
		const select = vi.fn(() => ({ from }));
		const db = { select } as unknown as DrizzleDatabase;
		const table = { id: { name: 'id' } } as unknown as AnyPgTable;
		const repo = new FakeRepo(db, table);
		await expect(repo.findById('a')).resolves.toEqual({ id: 'a', name: 'Alpha' });
	});
});
