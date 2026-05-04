import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
	const hasher = new Argon2PasswordHasher({ memoryCost: 8192, timeCost: 2, parallelism: 1 });

	it('produces a verifiable hash for a plaintext password', async () => {
		const hash = await hasher.hash('correct-horse-battery-staple');
		expect(hash.value).toMatch(/^\$argon2id\$/);
		expect(await hasher.verify('correct-horse-battery-staple', hash)).toBe(true);
	});

	it('rejects mismatching passwords', async () => {
		const hash = await hasher.hash('correct-horse-battery-staple');
		expect(await hasher.verify('wrong-password', hash)).toBe(false);
	});

	it('produces distinct hashes for the same plaintext (salted)', async () => {
		const a = await hasher.hash('same-password');
		const b = await hasher.hash('same-password');
		expect(a.value).not.toBe(b.value);
	});
});
