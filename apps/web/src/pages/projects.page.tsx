import type { ProjectManagementContracts } from '@rankpulse/contracts';
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
import { Link } from '@tanstack/react-router';
import { Plus, Target } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';
import { useAuthStore } from '../lib/auth-store.js';

const projectsKey = (orgId: string) => ['projects', orgId] as const;

export const ProjectsPage = () => {
	const { t } = useTranslation(['common', 'projects']);
	const me = useAuthStore((s) => s.me);
	const orgId = me?.memberships[0]?.organizationId;

	const [showForm, setShowForm] = useState(false);

	const projectsQuery = useQuery({
		queryKey: orgId ? projectsKey(orgId) : ['projects', 'none'],
		queryFn: () =>
			orgId ? api.projects.list(orgId) : Promise.resolve([] as ProjectManagementContracts.ProjectDto[]),
		enabled: Boolean(orgId),
	});

	if (!orgId) {
		return (
			<AppShell>
				<EmptyState
					icon={<Target size={32} />}
					title="No organization linked yet"
					description="Reload the page or sign in again."
				/>
			</AppShell>
		);
	}

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
				<header className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{t('projects:title')}</h1>
						<p className="text-sm text-muted-foreground">
							{me?.memberships[0]?.role} · org id {orgId.slice(0, 8)}…
						</p>
					</div>
					<Button onClick={() => setShowForm((v) => !v)}>
						<Plus size={16} />
						{t('projects:newProject')}
					</Button>
				</header>

				{showForm ? (
					<NewProjectForm
						organizationId={orgId}
						onCreated={() => {
							setShowForm(false);
						}}
					/>
				) : null}

				{projectsQuery.isLoading ? (
					<div className="flex justify-center py-10">
						<Spinner size="lg" />
					</div>
				) : projectsQuery.isError ? (
					<EmptyState
						title="Could not load projects"
						description={projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Unknown error'}
						action={
							<Button variant="secondary" onClick={() => projectsQuery.refetch()}>
								{t('common:retry')}
							</Button>
						}
					/>
				) : projectsQuery.data && projectsQuery.data.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{projectsQuery.data.map((project) => (
							<ProjectCard key={project.id} project={project} />
						))}
					</div>
				) : (
					<EmptyState
						icon={<Target size={32} />}
						title={t('projects:empty')}
						description={t('projects:emptyDescription')}
						action={<Button onClick={() => setShowForm(true)}>{t('projects:newProject')}</Button>}
					/>
				)}
			</div>
		</AppShell>
	);
};

const ProjectCard = ({ project }: { project: ProjectManagementContracts.ProjectDto }) => (
	<Link to="/projects/$id" params={{ id: project.id }} className="block">
		<Card className="transition-colors hover:border-accent/40">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>{project.name}</CardTitle>
					<Badge
						variant={
							project.kind === 'OWN' ? 'default' : project.kind === 'COMPETITOR' ? 'warning' : 'secondary'
						}
					>
						{project.kind.toLowerCase()}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-2 text-sm text-muted-foreground">
				<p>
					<span className="font-medium text-foreground">{project.primaryDomain}</span>
				</p>
				<p>
					{project.domains.length} domain{project.domains.length === 1 ? '' : 's'} ·{' '}
					{project.locations.length} location{project.locations.length === 1 ? '' : 's'}
				</p>
			</CardContent>
		</Card>
	</Link>
);

const NewProjectForm = ({
	organizationId,
	onCreated,
}: {
	organizationId: string;
	onCreated: () => void;
}) => {
	const { t } = useTranslation(['common', 'projects']);
	const queryClient = useQueryClient();
	const [name, setName] = useState('');
	const [domain, setDomain] = useState('');
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: (input: { name: string; primaryDomain: string }) =>
			api.projects.create({
				organizationId,
				portfolioId: null,
				name: input.name,
				primaryDomain: input.primaryDomain,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: projectsKey(organizationId) });
			setName('');
			setDomain('');
			onCreated();
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : 'Could not create project');
		},
	});

	const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		mutation.mutate({ name, primaryDomain: domain });
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{t('projects:create')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
					<FormField label={t('projects:nameLabel')}>
						{(id) => (
							<Input id={id} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
						)}
					</FormField>
					<FormField
						label={t('projects:domainLabel')}
						hint={t('projects:domainHint')}
						error={error ?? undefined}
					>
						{(id) => <Input id={id} required value={domain} onChange={(e) => setDomain(e.target.value)} />}
					</FormField>
					<div className="flex gap-2 md:col-span-2">
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? t('common:loading') : t('projects:create')}
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
