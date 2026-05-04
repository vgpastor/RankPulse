/**
 * Generates a cryptographically random plaintext token plus its hash.
 * The plaintext is shown to the user exactly once at creation time;
 * only the hash is persisted.
 */
export interface ApiTokenGenerator {
	issue(): { plaintext: string; hashed: string };
	hash(plaintext: string): string;
}
