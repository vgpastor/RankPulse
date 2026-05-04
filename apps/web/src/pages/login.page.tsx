import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	FormField,
	Input,
} from '@rankpulse/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { useAuthStore } from '../lib/auth-store.js';

export const LoginPage = () => {
	const { t } = useTranslation(['common', 'auth']);
	const navigate = useNavigate();
	const setSession = useAuthStore((s) => s.setSession);

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const session = await api.auth.login({ email, password });
			setSession(session);
			await navigate({ to: '/projects' });
		} catch {
			setError(t('auth:invalidCredentials'));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t('auth:loginTitle')}</CardTitle>
					<CardDescription>{t('auth:loginSubtitle')}</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						<FormField label={t('common:email')}>
							{(id) => (
								<Input
									id={id}
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							)}
						</FormField>
						<FormField label={t('common:password')} error={error ?? undefined}>
							{(id) => (
								<Input
									id={id}
									type="password"
									autoComplete="current-password"
									required
									minLength={1}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							)}
						</FormField>
						<Button type="submit" disabled={submitting}>
							{submitting ? t('common:loading') : t('common:signIn')}
						</Button>
						<p className="text-center text-sm text-muted-foreground">
							{t('auth:dontHaveAccount')}{' '}
							<Link to="/register" className="text-accent hover:underline">
								{t('common:signUp')}
							</Link>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};
