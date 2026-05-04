import { randomUUID } from 'node:crypto';

export type Uuid = string & { readonly __brand: 'Uuid' };

export const Uuid = {
	generate(): Uuid {
		return randomUUID() as Uuid;
	},
	parse(value: string): Uuid {
		if (!UUID_RE.test(value)) {
			throw new Error(`Invalid UUID: ${value}`);
		}
		return value as Uuid;
	},
	is(value: string): value is Uuid {
		return UUID_RE.test(value);
	},
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IdGenerator {
	generate(): Uuid;
}

export const SystemIdGenerator: IdGenerator = {
	generate: () => Uuid.generate(),
};

export class FixedIdGenerator implements IdGenerator {
	private index = 0;

	constructor(private readonly ids: readonly Uuid[]) {}

	generate(): Uuid {
		const id = this.ids[this.index];
		if (!id) {
			throw new Error(`FixedIdGenerator exhausted after ${this.index} ids`);
		}
		this.index += 1;
		return id;
	}
}
