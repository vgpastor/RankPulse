import { Button, Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { useAuthStore } from '../lib/auth-store.js';

interface AppShellProps {
	children?: ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const session = useAuthStore((s) => s.session);
	const setMe = useAuthStore((s) => s.setMe);
	const clear = useAuthStore((s) => s.clear);

	const meQuery = useQuery({
		queryKey: ['me'],
		queryFn: () => api.auth.me(),
		enabled: Boolean(session),
	});

	useEffect(() => {
		if (meQuery.data) {
			setMe(meQuery.data);
		}
	}, [meQuery.data, setMe]);

	useEffect(() => {
		if (!session) {
			void navigate({ to: '/login', replace: true });
		}
	}, [session, navigate]);

	if (!session) return null;

	if (meQuery.isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}

	const onSignOut = async (): Promise<void> => {
		clear();
		await navigate({ to: '/login', replace: true });
	};

	const toggleLang = async (): Promise<void> => {
		await i18n.changeLanguage(i18n.language.startsWith('es') ? 'en' : 'es');
	};

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b border-border bg-card/40">
				<div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
					<div className="flex items-center gap-6">
						<Link to="/projects" className="font-semibold tracking-tight">
							{t('common:appName')}
						</Link>
						<nav className="flex items-center gap-4 text-sm">
							<Link
								to="/projects"
								className="text-muted-foreground hover:text-foreground"
								activeProps={{ className: 'text-foreground font-medium' }}
							>
								{t('projects:title')}
							</Link>
							<Link
								to="/portfolios"
								className="text-muted-foreground hover:text-foreground"
								activeProps={{ className: 'text-foreground font-medium' }}
							>
								Portfolios
							</Link>
							<Link
								to="/credentials"
								className="text-muted-foreground hover:text-foreground"
								activeProps={{ className: 'text-foreground font-medium' }}
							>
								{t('credentials:title')}
							</Link>
						</nav>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-muted-foreground">{session.user.email}</span>
						<Button variant="ghost" size="sm" onClick={toggleLang}>
							{i18n.language.startsWith('es') ? 'EN' : 'ES'}
						</Button>
						<Button variant="secondary" size="sm" onClick={onSignOut}>
							<LogOut size={14} />
							{t('common:signOut')}
						</Button>
					</div>
				</div>
			</header>
			<main>{children ?? <Outlet />}</main>
		</div>
	);
};
