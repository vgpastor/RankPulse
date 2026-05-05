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

export const RegisterPage = () => {
	const { t } = useTranslation(['common', 'auth']);
	const navigate = useNavigate();
	const setSession = useAuthStore((s) => s.setSession);

	const [orgName, setOrgName] = useState('');
	const [slug, setSlug] = useState('');
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			await api.auth.register({
				organizationName: orgName,
				slug,
				owner: { email, name, password },
			});
			const session = await api.auth.login({ email, password });
			setSession(session);
			// BACKLOG A9 — fresh accounts go through the onboarding wizard
			// (credential → project → keyword) so the dashboard is never empty
			// the first time the user lands on it.
			await navigate({ to: '/onboarding' });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Registration failed');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t('auth:registerTitle')}</CardTitle>
					<CardDescription>{t('auth:registerSubtitle')}</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						<FormField label={t('common:organization')}>
							{(id) => (
								<Input
									id={id}
									required
									minLength={2}
									value={orgName}
									onChange={(e) => setOrgName(e.target.value)}
								/>
							)}
						</FormField>
						<FormField label={t('common:slug')} hint="lowercase-alphanumeric-with-dashes">
							{(id) => (
								<Input
									id={id}
									required
									pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
									value={slug}
									onChange={(e) => setSlug(e.target.value.toLowerCase())}
								/>
							)}
						</FormField>
						<FormField label={t('common:name')}>
							{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}
						</FormField>
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
						<FormField label={t('common:password')} hint="Min. 12 characters" error={error ?? undefined}>
							{(id) => (
								<Input
									id={id}
									type="password"
									autoComplete="new-password"
									required
									minLength={12}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							)}
						</FormField>
						<Button type="submit" disabled={submitting}>
							{submitting ? t('common:loading') : t('common:signUp')}
						</Button>
						<p className="text-center text-sm text-muted-foreground">
							{t('auth:alreadyHaveAccount')}{' '}
							<Link to="/login" className="text-accent hover:underline">
								{t('common:signIn')}
							</Link>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};
