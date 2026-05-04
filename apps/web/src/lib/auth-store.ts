import type { IdentityAccessContracts } from '@rankpulse/contracts';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthSession {
	accessToken: string;
	expiresAt: string;
	user: { userId: string; email: string; name: string };
}

interface AuthState {
	session: AuthSession | null;
	me: IdentityAccessContracts.MeResponse | null;
	setSession(session: AuthSession | null): void;
	setMe(me: IdentityAccessContracts.MeResponse | null): void;
	clear(): void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			session: null,
			me: null,
			setSession: (session) => {
				set({ session });
			},
			setMe: (me) => {
				set({ me });
			},
			clear: () => {
				set({ session: null, me: null });
			},
		}),
		{
			name: 'rankpulse.auth',
			version: 1,
			partialize: (state) => ({ session: state.session }),
		},
	),
);

export const getAccessToken = (): string | undefined => useAuthStore.getState().session?.accessToken;
