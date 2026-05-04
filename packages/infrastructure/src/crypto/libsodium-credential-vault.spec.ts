import { describe, expect, it } from 'vitest';
import { LibsodiumCredentialVault } from './libsodium-credential-vault.js';

describe('LibsodiumCredentialVault', () => {
	const vault = new LibsodiumCredentialVault('test-master-key-32-chars-or-more!');

	it('round-trips ciphertext through encrypt/decrypt', async () => {
		const enc = await vault.encrypt('vgpastor@patroltech.online|s3cret');
		expect(enc.ciphertext).not.toContain('s3cret');
		expect(enc.lastFour).toBe('cret');
		const plain = await vault.decrypt(enc);
		expect(plain).toBe('vgpastor@patroltech.online|s3cret');
	});

	it('uses a fresh nonce per encryption', async () => {
		const a = await vault.encrypt('same-secret');
		const b = await vault.encrypt('same-secret');
		expect(a.nonce).not.toBe(b.nonce);
		expect(a.ciphertext).not.toBe(b.ciphertext);
	});

	it('refuses to decrypt with the wrong key', async () => {
		const enc = await vault.encrypt('confidential');
		const otherVault = new LibsodiumCredentialVault('different-master-key-also-long!');
		await expect(otherVault.decrypt(enc)).rejects.toThrow();
	});
});
