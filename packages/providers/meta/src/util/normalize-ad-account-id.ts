/**
 * Meta surfaces ad accounts as `act_<digits>` in API paths but the Business
 * Manager UI accepts both forms. The provider receives raw operator input
 * post-Zod-validation; we canonicalise to the prefixed form before building
 * the URL so the request hash stays stable across input variants.
 */
export const normalizeAdAccountId = (raw: string): string => (raw.startsWith('act_') ? raw : `act_${raw}`);
