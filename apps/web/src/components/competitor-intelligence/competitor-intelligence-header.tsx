import type { ProjectManagementContracts } from '@rankpulse/contracts';
import { Label, Select } from '@rankpulse/ui';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CompetitorIntelligenceHeaderProps {
	projectId: string;
	project: ProjectManagementContracts.ProjectDto | undefined;
	ourDomain: string;
	onOurDomainChange: (value: string) => void;
	country: string;
	onCountryChange: (value: string) => void;
	language: string;
	onLanguageChange: (value: string) => void;
}

/**
 * Page-level header for the Competitor Intelligence page. Renders the title,
 * a breadcrumb back to the project, and the cross-tab filters (own domain,
 * country, language). The country/language selectors are derived from the
 * project's tracked locations (so we never offer unsupported combos).
 */
export const CompetitorIntelligenceHeader = ({
	projectId,
	project,
	ourDomain,
	onOurDomainChange,
	country,
	onCountryChange,
	language,
	onLanguageChange,
}: CompetitorIntelligenceHeaderProps) => {
	const { t } = useTranslation('competitorIntelligence');

	const ourDomainOptions = project
		? [...new Set([project.primaryDomain, ...project.domains.map((d) => d.domain)])]
		: [];

	const locations = project?.locations ?? [];
	const countries = [...new Set(locations.map((l) => l.country))];
	const languages = [
		...new Set(locations.filter((l) => !country || l.country === country).map((l) => l.language)),
	];

	return (
		<header className="flex flex-col gap-3">
			<Link
				to="/projects/$id"
				params={{ id: projectId }}
				className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft size={12} />
				{t('backToProject')}
			</Link>
			<div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
						<Target size={20} className="text-primary" />
						{t('title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{project?.name ? `${project.name} · ${t('subtitle')}` : t('subtitle')}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div className="flex flex-col gap-1">
					<Label htmlFor="ci-our-domain">{t('filters.ourDomain')}</Label>
					<Select
						id="ci-our-domain"
						value={ourDomain}
						onChange={(e) => onOurDomainChange(e.target.value)}
						className="min-h-11"
					>
						{ourDomainOptions.length === 0 ? (
							<option value="">—</option>
						) : (
							ourDomainOptions.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))
						)}
					</Select>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="ci-country">{t('filters.country')}</Label>
					<Select
						id="ci-country"
						value={country}
						onChange={(e) => onCountryChange(e.target.value)}
						className="min-h-11"
					>
						<option value="">—</option>
						{countries.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</Select>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="ci-language">{t('filters.language')}</Label>
					<Select
						id="ci-language"
						value={language}
						onChange={(e) => onLanguageChange(e.target.value)}
						className="min-h-11"
					>
						<option value="">—</option>
						{languages.map((l) => (
							<option key={l} value={l}>
								{l}
							</option>
						))}
					</Select>
				</div>
			</div>
		</header>
	);
};
