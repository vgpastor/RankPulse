import { RankPulseClient } from '@rankpulse/sdk';
import { getAccessToken } from './auth-store.js';

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const api = new RankPulseClient({
	baseUrl,
	getAuthToken: () => getAccessToken(),
});
