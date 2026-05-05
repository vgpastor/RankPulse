import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	FormField,
	Input,
	Select,
	Spinner,
} from '@rankpulse/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuthStore } from '../lib/auth-store.js';

interface CountryOption {
	iso: string;
	dataforseoCode: number;
	defaultLanguage: string;
	label: string;
}

/**
 * BACKLOG A9 — small onboarding-only catalogue. The full DataForSEO location
 * dictionary has 99k+ entries; for the wizard we only need a quick-pick of
 * the markets RankPulse customers most commonly target. Operators that need
 * more granularity can edit the project locations afterwards.
 *
 * Tuple typing (`as const`) so `DEFAULT_COUNTRY` is statically known to
 * exist — no `!` non-null assertion needed.
 */
const COUNTRIES = [
	{ iso: 'ES', dataforseoCode: 2724, defaultLanguage: 'es', label: 'Spain (es)' },
	{ iso: 'US', dataforseoCode: 2840, defaultLanguage: 'en', label: 'United States (en)' },
	{ iso: 'GB', dataforseoCode: 2826, defaultLanguage: 'en', label: 'United Kingdom (en)' },
	{ iso: 'FR', dataforseoCode: 2250, defaultLanguage: 'fr', label: 'France (fr)' },
	{ iso: 'DE', dataforseoCode: 2276, defaultLanguage: 'de', label: 'Germany (de)' },
	{ iso: 'IT', dataforseoCode: 2380, defaultLanguage: 'it', label: 'Italy (it)' },
	{ iso: 'MX', dataforseoCode: 2484, defaultLanguage: 'es', label: 'Mexico (es)' },
	{ iso: 'AR', dataforseoCode: 2032, defaultLanguage: 'es', label: 'Argentina (es)' },
	{ iso: 'BR', dataforseoCode: 2076, defaultLanguage: 'pt', label: 'Brazil (pt)' },
] as const satisfies readonly CountryOption[];

const DEFAULT_COUNTRY: CountryOption = COUNTRIES[0];

type Step = 'credential' | 'project' | 'keyword' | 'done';

/**
 * BACKLOG A9 — post-registration wizard.
 *
 * Funnels new owners through the three things the dashboard is empty without:
 *   1. A DataForSEO credential (no SERP data without it).
 *   2. A first project + locale.
 *   3. A first tracked keyword with auto-schedule (so the dashboard
 *      starts populating today, not "whenever the operator remembers
 *      to schedule something").
 *
 * Skip is allowed at any step — the wizard is a UX accelerator, not a
 * gate. Every operation here can also be performed from its own page.
 *
 * Mobile-first: each step is a single-column card. The same layout
 * works on desktop (max-w-md centered) without media queries.
 */
export const OnboardingPage = () => {
	const navigate = useNavigate();
	const session = useAuthStore((s) => s.session);

	const meQuery = useQuery({
		queryKey: ['me'],
		queryFn: () => api.auth.me(),
		enabled: Boolean(session),
	});
	const orgId = meQuery.data?.memberships[0]?.organizationId;

	// Re-entry guard: if the org already has projects, the user has
	// either completed the wizard or set things up manually elsewhere.
	// Sending them through it again risks duplicate credentials/projects
	// on form resubmits (e.g. accidental refresh after partial success).
	const projectsQuery = useQuery({
		queryKey: ['projects', orgId],
		queryFn: () => (orgId ? api.projects.list(orgId) : Promise.resolve([])),
		enabled: Boolean(orgId),
	});
	useEffect(() => {
		if (projectsQuery.data && projectsQuery.data.length > 0) {
			void navigate({ to: '/projects' });
		}
	}, [projectsQuery.data, navigate]);

	const [step, setStep] = useState<Step>('credential');
	const [secret, setSecret] = useState('');
	const [credentialLabel, setCredentialLabel] = useState('Production');
	const [projectName, setProjectName] = useState('');
	const [primaryDomain, setPrimaryDomain] = useState('');
	const [countryIso, setCountryIso] = useState<string>('ES');
	const [phrase, setPhrase] = useState('');
	const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const country: CountryOption = COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_COUNTRY;

	const skip = async (): Promise<void> => {
		const target = createdProjectId ? `/projects/${createdProjectId}` : '/projects';
		await navigate({ to: target });
	};

	const credentialMutation = useMutation({
		mutationFn: () => {
			if (!orgId) throw new Error('Loading organization…');
			return api.providers.registerCredential('dataforseo', {
				organizationId: orgId,
				providerId: 'dataforseo',
				scope: { type: 'org', id: orgId },
				label: credentialLabel,
				plaintextSecret: secret,
			});
		},
		onSuccess: () => {
			setSecret('');
			setStep('project');
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Could not register credential'),
	});

	const projectMutation = useMutation({
		mutationFn: async () => {
			if (!orgId) throw new Error('Loading organization…');
			const project = await api.projects.create({
				organizationId: orgId,
				portfolioId: null,
				name: projectName,
				primaryDomain,
				initialLocations: [{ country: country.iso, language: country.defaultLanguage }],
			});
			return project;
		},
		onSuccess: (project) => {
			setCreatedProjectId(project.id);
			setStep('keyword');
		},
		onError: (err) => setError(err instanceof Error ? err.message : 'Could not create project'),
	});

	const keywordMutation = useMutation({
		mutationFn: async () => {
			if (!createdProjectId) throw new Error('Project missing');
			return api.rankTracking.startTracking({
				projectId: createdProjectId,
				domain: primaryDomain,
				phrase,
				country: country.iso,
				language: country.defaultLanguage,
				device: 'desktop',
				autoSchedule: {
					providerId: 'dataforseo',
					endpointId: 'serp-google-organic-live',
					cron: '0 6 * * *',
					params: {
						keyword: phrase,
						locationCode: country.dataforseoCode,
						languageCode: country.defaultLanguage,
						device: 'desktop',
						depth: 20,
					},
				},
			});
		},
		onSuccess: () => setStep('done'),
		onError: (err) => setError(err instanceof Error ? err.message : 'Could not start tracking'),
	});

	const onCredentialSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		credentialMutation.mutate();
	};
	const onProjectSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		projectMutation.mutate();
	};
	const onKeywordSubmit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		setError(null);
		keywordMutation.mutate();
	};

	if (meQuery.isLoading || projectsQuery.isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}
	if (!orgId) {
		return (
			<div className="flex min-h-screen items-center justify-center px-4">
				<p className="text-sm text-destructive">Cannot load your organization. Please sign in again.</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:py-12">
			<Card className="w-full max-w-md">
				<CardHeader className="gap-2">
					<StepIndicator step={step} />
					{step === 'credential' && (
						<>
							<CardTitle>Connect DataForSEO</CardTitle>
							<CardDescription>
								DataForSEO powers SERP rank tracking. Paste your <code>email|api_password</code>; it's
								encrypted at rest before reaching the database.
							</CardDescription>
						</>
					)}
					{step === 'project' && (
						<>
							<CardTitle>Create your first project</CardTitle>
							<CardDescription>
								A project groups one primary domain, a market and the keywords you want to track on it.
							</CardDescription>
						</>
					)}
					{step === 'keyword' && (
						<>
							<CardTitle>Track your first keyword</CardTitle>
							<CardDescription>
								We'll fetch the SERP daily at 06:00 UTC starting tomorrow. Position history populates
								automatically — no need to come back and click anything.
							</CardDescription>
						</>
					)}
					{step === 'done' && (
						<>
							<CardTitle>You're all set</CardTitle>
							<CardDescription>
								Your first SERP fetch is scheduled. Come back tomorrow to see the first observation.
							</CardDescription>
						</>
					)}
				</CardHeader>
				<CardContent>
					{step === 'credential' && (
						<form onSubmit={onCredentialSubmit} className="flex flex-col gap-4">
							<FormField label="Label" hint="Free-form, helps you identify this credential later.">
								{(id) => (
									<Input
										id={id}
										required
										minLength={1}
										maxLength={80}
										value={credentialLabel}
										onChange={(e) => setCredentialLabel(e.target.value)}
									/>
								)}
							</FormField>
							<FormField
								label="DataForSEO credential"
								hint="Format: email|api_password"
								error={error ?? undefined}
							>
								{(id) => (
									<Input
										id={id}
										required
										type="password"
										autoComplete="off"
										value={secret}
										onChange={(e) => setSecret(e.target.value)}
										placeholder="you@example.com|abcdef123456"
									/>
								)}
							</FormField>
							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
								<Button type="button" variant="ghost" onClick={() => void skip()}>
									Skip onboarding
								</Button>
								<Button type="submit" disabled={credentialMutation.isPending}>
									{credentialMutation.isPending ? 'Saving…' : 'Continue'}
									<ArrowRight size={14} />
								</Button>
							</div>
						</form>
					)}

					{step === 'project' && (
						<form onSubmit={onProjectSubmit} className="flex flex-col gap-4">
							<FormField label="Project name">
								{(id) => (
									<Input
										id={id}
										required
										minLength={2}
										maxLength={80}
										value={projectName}
										onChange={(e) => setProjectName(e.target.value)}
										placeholder="My SaaS"
									/>
								)}
							</FormField>
							<FormField label="Primary domain" hint="Bare domain, e.g. example.com">
								{(id) => (
									<Input
										id={id}
										required
										minLength={3}
										maxLength={253}
										value={primaryDomain}
										onChange={(e) => setPrimaryDomain(e.target.value)}
										placeholder="example.com"
									/>
								)}
							</FormField>
							<FormField
								label="Market"
								hint="Country + default language for the SERP."
								error={error ?? undefined}
							>
								{(id) => (
									<Select id={id} value={countryIso} onChange={(e) => setCountryIso(e.target.value)}>
										{COUNTRIES.map((c) => (
											<option key={c.iso} value={c.iso}>
												{c.label}
											</option>
										))}
									</Select>
								)}
							</FormField>
							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
								<Button type="button" variant="ghost" onClick={() => setStep('credential')}>
									<ArrowLeft size={14} />
									Back
								</Button>
								<Button type="submit" disabled={projectMutation.isPending}>
									{projectMutation.isPending ? 'Creating…' : 'Continue'}
									<ArrowRight size={14} />
								</Button>
							</div>
						</form>
					)}

					{step === 'keyword' && (
						<form onSubmit={onKeywordSubmit} className="flex flex-col gap-4">
							<FormField
								label="First keyword to track"
								hint={`Will be tracked on ${primaryDomain} in ${country.label}.`}
							>
								{(id) => (
									<Input
										id={id}
										required
										minLength={1}
										maxLength={200}
										value={phrase}
										onChange={(e) => setPhrase(e.target.value)}
										placeholder="best alternative to X"
									/>
								)}
							</FormField>
							{error && <p className="text-sm text-destructive">{error}</p>}
							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
								<Button type="button" variant="ghost" onClick={() => void skip()}>
									Skip
								</Button>
								<Button type="submit" disabled={keywordMutation.isPending}>
									{keywordMutation.isPending ? 'Scheduling…' : 'Track + schedule daily SERP'}
									<ArrowRight size={14} />
								</Button>
							</div>
						</form>
					)}

					{step === 'done' && (
						<div className="flex flex-col gap-4">
							<ul className="space-y-2 text-sm">
								<li className="flex items-center gap-2">
									<Check size={14} className="text-primary" />
									DataForSEO credential registered
								</li>
								<li className="flex items-center gap-2">
									<Check size={14} className="text-primary" />
									Project &quot;{projectName}&quot; created in {country.label}
								</li>
								<li className="flex items-center gap-2">
									<Check size={14} className="text-primary" />
									Keyword &quot;{phrase}&quot; scheduled daily at 06:00 UTC
								</li>
							</ul>
							<Button onClick={() => void skip()}>Go to project</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

const StepIndicator = ({ step }: { step: Step }) => {
	const order: Step[] = ['credential', 'project', 'keyword', 'done'];
	const currentIdx = order.indexOf(step);
	return (
		<ol className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Progress">
			{order.slice(0, 3).map((s, idx) => {
				const completed = idx < currentIdx || step === 'done';
				const active = s === step;
				return (
					<li key={s} className="flex items-center gap-2">
						<span
							className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
								completed
									? 'border-primary bg-primary text-primary-foreground'
									: active
										? 'border-primary text-primary'
										: 'border-border'
							}`}
							aria-current={active ? 'step' : undefined}
						>
							{completed ? <Check size={12} /> : idx + 1}
						</span>
						{idx < 2 && <span className="h-px w-4 bg-border sm:w-8" aria-hidden />}
					</li>
				);
			})}
		</ol>
	);
};
