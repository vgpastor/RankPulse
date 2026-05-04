import { describe, expect, it } from 'vitest';
import { FixedIdGenerator, SystemIdGenerator, Uuid } from './ids.js';

describe('Uuid', () => {
	it('generates valid v4 UUIDs', () => {
		const id = Uuid.generate();
		expect(Uuid.is(id)).toBe(true);
	});

	it('parses a valid uuid and rejects garbage', () => {
		expect(Uuid.parse('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
		expect(() => Uuid.parse('not-a-uuid')).toThrow();
	});
});

describe('SystemIdGenerator', () => {
	it('produces unique uuids', () => {
		const a = SystemIdGenerator.generate();
		const b = SystemIdGenerator.generate();
		expect(a).not.toBe(b);
	});
});

describe('FixedIdGenerator', () => {
	it('returns the configured ids in order', () => {
		const id1 = Uuid.generate();
		const id2 = Uuid.generate();
		const gen = new FixedIdGenerator([id1, id2]);
		expect(gen.generate()).toBe(id1);
		expect(gen.generate()).toBe(id2);
	});

	it('throws when exhausted', () => {
		const gen = new FixedIdGenerator([Uuid.generate()]);
		gen.generate();
		expect(() => gen.generate()).toThrow();
	});
});
