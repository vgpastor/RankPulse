import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	EmptyState,
	FormField,
	Input,
	Spinner,
} from '@rankpulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { LineChart, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { KeywordHistoryDrawer } from '../components/keyword-history-drawer.js';
import { api } from '../lib/api.js';

export const RankingsPage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/rankings' });
	const { t } = useTranslation(['common', 'rankings']);
	const [showForm, setShowForm] = useState(false);
	const [historyOf, setHistoryOf] = useState<{ trackedKeywordId: string; phrase: string } | null>(null);

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});

	const rankingsQuery = useQuery({
		queryKey: ['project', projectId, 'rankings'],
		queryFn: () => api.rankTracking.listProjectRankings(projectId),
	});

	if (projectQuery.isLoading || rankingsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const project = projectQuery.data;
	const rankings = rankingsQuery.data ?? [];

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
				<header className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{t('rankings:title')}</h1>
						<p className="text-sm text-muted-foreground">
							{project?.name} · {t('rankings:subtitle')}
						</p>
					</div>
					<Button onClick={() => setShowForm((v) => !v)}>
						<Plus size={16} />
						{t('rankings:track')}
					</Button>
				</header>

				{showForm && project ? (
					<TrackKeywordForm
						projectId={projectId}
						defaultDomain={project.primaryDomain}
						onCreated={() => setShowForm(false)}
					/>
				) : null}

				{rankings.length === 0 ? (
					<EmptyState
						icon={<LineChart size={32} />}
						title={t('rankings:empty')}
						description={t('rankings:emptyDescription')}
					/>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								{rankings.length} observation{rankings.length === 1 ? '' : 's'}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left text-xs uppercase text-muted-foreground">
											<th className="py-2">{t('rankings:phrase')}</th>
											<th>{t('rankings:country')}</th>
											<th>{t('rankings:device')}</th>
											<th>{t('rankings:position')}</th>
											<th>{t('rankings:observedAt')}</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{rankings.map((r) => (
											<tr
												key={`${r.trackedKeywordId}-${r.observedAt}`}
												onClick={() =>
													setHistoryOf({ trackedKeywordId: r.trackedKeywordId, phrase: r.phrase })
												}
												className="cursor-pointer hover:bg-muted/30"
											>
												<td className="py-2">
													<span className="font-medium">{r.phrase}</span>
													<span className="text-xs text-muted-foreground"> · {r.domain}</span>
												</td>
												<td>
													<Badge variant="secondary">
														{r.country} · {r.language}
													</Badge>
												</td>
												<td>
													<Badge variant={r.device === 'desktop' ? 'default' : 'warning'}>{r.device}</Badge>
												</td>
												<td>
													{r.position === null ? (
														<span className="text-muted-foreground">{t('common:notRanked')}</span>
													) : (
														<span className="font-mono font-semibold">#{r.position}</span>
													)}
												</td>
												<td className="text-xs text-muted-foreground">
													{new Date(r.observedAt).toLocaleString()}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
			<KeywordHistoryDrawer
				open={Boolean(historyOf)}
				onClose={() => setHistoryOf(null)}
				trackedKeywordId={historyOf?.trackedKeywordId ?? null}
				phrase={historyOf?.phrase ?? null}
			/>
		</AppShell>
	);
};

const TrackKeywordForm = ({
	projectId,
	defaultDomain,
	onCreated,
}: {
	projectId: string;
	defaultDomain: string;
	onCreated: () => void;
}) => {
	const { t } = useTranslation(['common', 'rankings']);
	const queryClient = useQueryClient();
	const [phrase, setPhrase] = useState('');
	const [domain, setDomain] = useState(defaultDomain);
	const [country, setCountry] = useState('ES');
	const [language, setLanguage] = useState('es');
	const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			api.rankTracking.startTracking({
				projectId,
				domain,
				phrase,
				country,
				language,
				device,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project', projectId, 'rankings'] });
			onCreated();
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : 'Could not start tracking');
		},
	});

	const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		mutation.mutate();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{t('rankings:track')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
					<FormField label={t('rankings:phrase')}>
						{(id) => <Input id={id} required value={phrase} onChange={(e) => setPhrase(e.target.value)} />}
					</FormField>
					<FormField label="Domain">
						{(id) => <Input id={id} required value={domain} onChange={(e) => setDomain(e.target.value)} />}
					</FormField>
					<FormField label={t('rankings:country')} hint="ISO-3166 alpha-2 (uppercase)">
						{(id) => (
							<Input
								id={id}
								required
								maxLength={2}
								value={country}
								onChange={(e) => setCountry(e.target.value.toUpperCase())}
							/>
						)}
					</FormField>
					<FormField label={t('rankings:language')}>
						{(id) => (
							<Input id={id} required value={language} onChange={(e) => setLanguage(e.target.value)} />
						)}
					</FormField>
					<FormField label={t('rankings:device')} error={error ?? undefined}>
						{(id) => (
							<select
								id={id}
								value={device}
								onChange={(e) => setDevice(e.target.value as 'desktop' | 'mobile')}
								className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm"
							>
								<option value="desktop">desktop</option>
								<option value="mobile">mobile</option>
							</select>
						)}
					</FormField>
					<div className="flex gap-2 md:col-span-2">
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? t('common:loading') : t('common:save')}
						</Button>
						<Button type="button" variant="secondary" onClick={onCreated}>
							{t('common:cancel')}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
};
