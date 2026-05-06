import { Spinner } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { DailyActionsCard } from '../components/daily-actions-card.js';
import { api } from '../lib/api.js';

export const DailyActionsPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/actions' });
	const { t } = useTranslation('dailyActions');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});

	if (projectQuery.isLoading || !projectQuery.data) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<header>
					<Link
						to="/projects/$id"
						params={{ id: projectId }}
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft size={12} />
						{t('back')}
					</Link>
					<h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
						<Bell size={20} className="text-primary" />
						{t('pageTitle')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{projectQuery.data.name} · {t('pageSubtitle')}
					</p>
				</header>

				<DailyActionsCard project={projectQuery.data} />

				<div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
					<p>{t('comingSoon')}</p>
				</div>
			</div>
		</AppShell>
	);
};
