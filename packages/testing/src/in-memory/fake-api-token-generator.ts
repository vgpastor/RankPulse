import { createHash, randomBytes } from 'node:crypto';
import type { IdentityAccess } from '@rankpulse/domain';

export class FakeApiTokenGenerator implements IdentityAccess.ApiTokenGenerator {
	private counter = 0;

	issue(): { plaintext: string; hashed: string } {
		this.counter += 1;
		const plaintext = `rp_test_${this.counter}_${randomBytes(16).toString('hex')}`;
		return { plaintext, hashed: this.hash(plaintext) };
	}

	hash(plaintext: string): string {
		return `sha256:${createHash('sha256').update(plaintext).digest('hex')}`;
	}
}
