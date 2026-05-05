import { InvalidInputError } from '@rankpulse/shared';

const PROJECT_REGEX = /^[a-z]{2,3}(?:-[a-z]+)?\.wikipedia\.org$/;

/**
 * `es.wikipedia.org`, `en.wikipedia.org`, `simple.wikipedia.org`, etc.
 * Only Wikipedia variants are accepted — Wiktionary / Wikimedia Commons
 * have different APIs and would land in their own provider eventually.
 */
export class WikipediaProject {
	private constructor(public readonly value: string) {}

	static create(raw: string): WikipediaProject {
		const normalized = raw.trim().toLowerCase();
		if (!PROJECT_REGEX.test(normalized)) {
			throw new InvalidInputError(`WikipediaProject must look like "<lang>.wikipedia.org" (got "${raw}")`);
		}
		return new WikipediaProject(normalized);
	}
}
