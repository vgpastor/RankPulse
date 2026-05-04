import type { ProviderConnectivityContracts } from '@rankpulse/contracts';
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
import { KeyRound, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { api } from '../lib/api.js';
import { useAuthStore } from '../lib/auth-store.js';

const SCOPE_OPTIONS: ProviderConnectivityContracts.CredentialScopeRequest['type'][] = [
	'org',
	'portfolio',
	'project',
	'domain',
];

export const CredentialsPage = () => {
	const { t } = useTranslation(['common', 'credentials']);
	const me = useAuthStore((s) => s.me);
	const orgId = me?.memberships[0]?.organizationId;
	const [showForm, setShowForm] = useState(false);

	const providersQuery = useQuery({
		queryKey: ['providers'],
		queryFn: () => api.providers.list(),
	});

	if (!orgId) {
		return (
			<AppShell>
				<EmptyState title="No organization linked yet" />
			</AppShell>
		);
	}

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
				<header className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{t('credentials:title')}</h1>
						<p className="text-sm text-muted-foreground">{t('credentials:subtitle')}</p>
					</div>
					<Button onClick={() => setShowForm((v) => !v)}>
						<Plus size={16} />
						{t('credentials:add')}
					</Button>
				</header>

				{showForm ? (
					<NewCredentialForm
						organizationId={orgId}
						onSaved={() => {
							setShowForm(false);
						}}
					/>
				) : null}

				{providersQuery.isLoading ? (
					<div className="flex justify-center py-10">
						<Spinner size="lg" />
					</div>
				) : providersQuery.data && providersQuery.data.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{providersQuery.data.map((provider) => (
							<ProviderCard key={provider.id} provider={provider} />
						))}
					</div>
				) : (
					<EmptyState
						icon={<KeyRound size={32} />}
						title={t('credentials:empty')}
						description={t('credentials:emptyDescription')}
					/>
				)}
			</div>
		</AppShell>
	);
};

const ProviderCard = ({ provider }: { provider: ProviderConnectivityContracts.ProviderDto }) => (
	<Card>
		<CardHeader>
			<div className="flex items-center justify-between">
				<CardTitle>{provider.displayName}</CardTitle>
				<Badge variant="secondary">{provider.authStrategy}</Badge>
			</div>
		</CardHeader>
		<CardContent className="space-y-2 text-sm">
			<p className="text-muted-foreground">
				{provider.endpoints.length} endpoint{provider.endpoints.length === 1 ? '' : 's'}
			</p>
			<ul className="space-y-1">
				{provider.endpoints.map((e) => (
					<li key={e.id} className="flex items-center justify-between">
						<span>
							<span className="font-medium">{e.displayName}</span>{' '}
							<span className="text-xs text-muted-foreground">· {e.category}</span>
						</span>
						<Badge variant="default">${(e.cost.amount / 100).toFixed(4)}</Badge>
					</li>
				))}
			</ul>
		</CardContent>
	</Card>
);

const NewCredentialForm = ({
	organizationId,
	onSaved,
}: {
	organizationId: string;
	onSaved: () => void;
}) => {
	const { t } = useTranslation(['common', 'credentials']);
	const queryClient = useQueryClient();
	const [providerId, setProviderId] = useState('dataforseo');
	const [scopeType, setScopeType] =
		useState<ProviderConnectivityContracts.CredentialScopeRequest['type']>('org');
	const [scopeId, setScopeId] = useState(organizationId);
	const [label, setLabel] = useState('default');
	const [plaintextSecret, setPlaintextSecret] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			api.providers.registerCredential(providerId, {
				organizationId,
				providerId,
				scope: { type: scopeType, id: scopeId },
				label,
				plaintextSecret,
			}),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ['providers'] });
			setPlaintextSecret('');
			setSuccess(`${t('credentials:registered')} · ${t('credentials:lastFour')} ${result.lastFour}`);
			setTimeout(() => onSaved(), 1200);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : 'Could not register credential');
		},
	});

	const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		mutation.mutate();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{t('credentials:add')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
					<FormField label={t('credentials:provider')}>
						{(id) => (
							<Input
								id={id}
								required
								value={providerId}
								onChange={(e) => setProviderId(e.target.value.toLowerCase())}
							/>
						)}
					</FormField>
					<FormField label={t('credentials:label')}>
						{(id) => <Input id={id} required value={label} onChange={(e) => setLabel(e.target.value)} />}
					</FormField>
					<FormField label={t('credentials:scope')} hint={t('credentials:scopeHelp')}>
						{(id) => (
							<select
								id={id}
								className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm"
								value={scopeType}
								onChange={(e) => {
									const next = e.target.value as ProviderConnectivityContracts.CredentialScopeRequest['type'];
									setScopeType(next);
									if (next === 'org') setScopeId(organizationId);
								}}
							>
								{SCOPE_OPTIONS.map((opt) => (
									<option key={opt} value={opt}>
										{opt}
									</option>
								))}
							</select>
						)}
					</FormField>
					<FormField label="Scope id">
						{(id) => <Input id={id} required value={scopeId} onChange={(e) => setScopeId(e.target.value)} />}
					</FormField>
					<FormField
						label={t('credentials:secret')}
						hint={providerId === 'dataforseo' ? t('credentials:secretDataForSeoHint') : undefined}
						error={error ?? undefined}
						className="md:col-span-2"
					>
						{(id) => (
							<Input
								id={id}
								required
								type="password"
								value={plaintextSecret}
								onChange={(e) => setPlaintextSecret(e.target.value)}
							/>
						)}
					</FormField>
					{success ? <p className="text-xs text-emerald-600 md:col-span-2">{success}</p> : null}
					<div className="flex gap-2 md:col-span-2">
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? t('common:loading') : t('common:save')}
						</Button>
						<Button type="button" variant="secondary" onClick={onSaved}>
							{t('common:cancel')}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
};
