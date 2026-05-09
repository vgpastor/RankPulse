import { EmptyState, Spinner, type TabItem, Tabs } from '@rankpulse/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/app-shell.js';
import { CompetitorIntelligenceHeader } from '../components/competitor-intelligence/competitor-intelligence-header.js';
import { KeywordGapsTab } from '../components/competitor-intelligence/keyword-gaps-tab.js';
import { LlmMentionTrendTab } from '../components/competitor-intelligence/llm-mention-trend-tab.js';
import { PageAuditsDiffTab } from '../components/competitor-intelligence/page-audits-diff-tab.js';
import { TopPagesTab } from '../components/competitor-intelligence/top-pages-tab.js';
import { api } from '../lib/api.js';

type TabId = 'keyword-gaps' | 'top-pages' | 'page-audits-diff' | 'llm-mention-trend';

export const CompetitorIntelligencePage = () => {
	const { id: projectId } = useParams({ from: '/projects/$id/competitor-intelligence' });
	const { t } = useTranslation('competitorIntelligence');

	const [activeTab, setActiveTab] = useState<TabId>('keyword-gaps');
	const [ourDomain, setOurDomain] = useState<string>('');
	const [country, setCountry] = useState<string>('');
	const [language, setLanguage] = useState<string>('');

	const projectQuery = useQuery({
		queryKey: ['project', projectId],
		queryFn: () => api.projects.get(projectId),
	});
	const competitorsQuery = useQuery({
		queryKey: ['project', projectId, 'competitors'],
		queryFn: () => api.projects.listCompetitors(projectId),
	});

	const project = projectQuery.data;
	const competitors = competitorsQuery.data ?? [];

	// Default ourDomain = project's primary domain. Stable across re-renders so
	// child tabs don't refetch on a flicker.
	const effectiveOurDomain = ourDomain || project?.primaryDomain || '';

	const tabs: readonly TabItem[] = useMemo(
		() => [
			{ id: 'keyword-gaps', label: t('tabs.keywordGaps') },
			{ id: 'top-pages', label: t('tabs.topPages') },
			{ id: 'page-audits-diff', label: t('tabs.pageAuditsDiff') },
			{ id: 'llm-mention-trend', label: t('tabs.llmMentionTrend') },
		],
		[t],
	);

	if (projectQuery.isLoading || competitorsQuery.isLoading) {
		return (
			<AppShell>
				<div className="flex justify-center py-10">
					<Spinner size="lg" />
				</div>
			</AppShell>
		);
	}

	const hasCompetitors = competitors.length > 0;

	return (
		<AppShell>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<CompetitorIntelligenceHeader
					projectId={projectId}
					project={project}
					ourDomain={effectiveOurDomain}
					onOurDomainChange={setOurDomain}
					country={country}
					onCountryChange={setCountry}
					language={language}
					onLanguageChange={setLanguage}
				/>

				{!hasCompetitors ? (
					<EmptyState
						icon={<Target size={32} />}
						title={t('noCompetitors')}
						description={t('noCompetitorsDescription')}
					/>
				) : (
					<>
						<Tabs
							tabs={tabs}
							activeId={activeTab}
							onChange={(id) => setActiveTab(id as TabId)}
							ariaLabel={t('tabs.ariaLabel')}
						/>

						{/* Each tab is its own React subtree → its own queries; nothing
						    blocks the rest of the page when one tab is loading. */}
						{activeTab === 'keyword-gaps' ? (
							<KeywordGapsTab
								projectId={projectId}
								ourDomain={effectiveOurDomain}
								competitors={competitors}
							/>
						) : null}
						{activeTab === 'top-pages' ? (
							<TopPagesTab projectId={projectId} competitors={competitors} />
						) : null}
						{activeTab === 'page-audits-diff' ? (
							<PageAuditsDiffTab projectId={projectId} competitors={competitors} />
						) : null}
						{activeTab === 'llm-mention-trend' ? <LlmMentionTrendTab projectId={projectId} /> : null}
					</>
				)}
			</div>
		</AppShell>
	);
};
