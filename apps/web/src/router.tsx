import {
	createRootRoute,
	createRoute,
	Outlet,
	type RootRoute,
	Router,
	redirect,
} from '@tanstack/react-router';
import { useAuthStore } from './lib/auth-store.js';
import { AiRadarPage } from './pages/ai-radar.page.js';
import { AiSearchCitationsPage } from './pages/ai-search-citations.page.js';
import { AiSearchMatrixPage } from './pages/ai-search-matrix.page.js';
import { BrandPromptsPage } from './pages/brand-prompts.page.js';
import { CannibalizationPage } from './pages/cannibalization.page.js';
import { CockpitPage } from './pages/cockpit.page.js';
import { CompetitorsPage } from './pages/competitors.page.js';
import { CredentialsPage } from './pages/credentials.page.js';
import { CtrAnomaliesPage } from './pages/ctr-anomalies.page.js';
import { DailyActionsPage } from './pages/daily-actions.page.js';
import { Ga4PropertiesPage } from './pages/ga4-properties.page.js';
import { Ga4TrafficPage } from './pages/ga4-traffic.page.js';
import { GapAnalysisPage } from './pages/gap-analysis.page.js';
import { GscPerformancePage } from './pages/gsc-performance.page.js';
import { GscPropertiesPage } from './pages/gsc-properties.page.js';
import { LoginPage } from './pages/login.page.js';
import { LostOpportunityPage } from './pages/lost-opportunity.page.js';
import { OnboardingPage } from './pages/onboarding.page.js';
import { OpportunitiesPage } from './pages/opportunities.page.js';
import { PortfolioComparePage } from './pages/portfolio-compare.page.js';
import { PortfoliosPage } from './pages/portfolios.page.js';
import { ProjectDetailPage } from './pages/project-detail.page.js';
import { ProjectsPage } from './pages/projects.page.js';
import { RankingsPage } from './pages/rankings.page.js';
import { RegisterPage } from './pages/register.page.js';
import { SchedulesPage } from './pages/schedules.page.js';
import { SerpMapPage } from './pages/serp-map.page.js';
import { WeeklyScorecardPage } from './pages/weekly-scorecard.page.js';

const rootRoute: RootRoute = createRootRoute({
	component: () => <Outlet />,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	beforeLoad: () => {
		const session = useAuthStore.getState().session;
		throw redirect({ to: session ? '/projects' : '/login' });
	},
});

// Both auth routes redirect away when there's already a VALID session
// — the previous behaviour let an authenticated user re-submit /login
// and silently overwrite their existing session, or hit /register and
// register a fresh org while keeping the prior session alive in
// localStorage. Either flow could orphan in-flight work.
//
// Expired sessions (token TTL passed) are treated as no session: they
// flow through to /login normally instead of getting bounced to
// /projects where every API call returns 401 and the user is trapped.
const redirectIfAuthed = (): void => {
	const session = useAuthStore.getState().session;
	if (!session) return;
	const expiresAt = new Date(session.expiresAt).getTime();
	if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
		throw redirect({ to: '/projects' });
	}
	// Session is expired — clear it so the in-app guards don't trip on
	// the stale token and so the user lands on the login page cleanly.
	useAuthStore.getState().clear();
};

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	beforeLoad: redirectIfAuthed,
	component: LoginPage,
});

const registerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/register',
	beforeLoad: redirectIfAuthed,
	component: RegisterPage,
});

const onboardingRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/onboarding',
	component: OnboardingPage,
});

const projectsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects',
	component: ProjectsPage,
});

const projectDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id',
	component: ProjectDetailPage,
});

const projectRankingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/rankings',
	component: RankingsPage,
});

const projectSerpMapRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/serp-map',
	component: SerpMapPage,
});

const projectCockpitRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/cockpit',
	component: CockpitPage,
});

const projectCtrAnomaliesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/ctr-anomalies',
	component: CtrAnomaliesPage,
});

const projectLostOpportunityRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/lost-opportunity',
	component: LostOpportunityPage,
});

const projectSchedulesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/schedules',
	component: SchedulesPage,
});

const projectGscPropertiesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/gsc',
	component: GscPropertiesPage,
});

const projectGa4PropertiesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/ga4',
	component: Ga4PropertiesPage,
});

const projectGa4TrafficRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/ga4/$propertyId',
	component: Ga4TrafficPage,
});

const projectBrandPromptsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/brand-prompts',
	component: BrandPromptsPage,
});

const projectAiSearchCitationsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/ai-search/citations',
	component: AiSearchCitationsPage,
});

const projectAiSearchMatrixRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/ai-search/matrix',
	component: AiSearchMatrixPage,
});

const projectAiRadarRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/ai-radar',
	component: AiRadarPage,
});

const projectCompetitorsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/competitors',
	component: CompetitorsPage,
});

const projectScorecardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/scorecard',
	component: WeeklyScorecardPage,
});

const projectOpportunitiesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/opportunities',
	component: OpportunitiesPage,
});

const projectGapAnalysisRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/gap-analysis',
	component: GapAnalysisPage,
});

const projectActionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/actions',
	component: DailyActionsPage,
});

const projectCannibalizationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/cannibalization',
	component: CannibalizationPage,
});

const projectGscPerformanceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/projects/$id/gsc/$propertyId',
	component: GscPerformancePage,
});

const credentialsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/credentials',
	component: CredentialsPage,
});

const portfoliosRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/portfolios',
	component: PortfoliosPage,
});

const portfolioCompareRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/portfolios/$id/compare',
	component: PortfolioComparePage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	loginRoute,
	registerRoute,
	onboardingRoute,
	projectsRoute,
	projectDetailRoute,
	projectRankingsRoute,
	projectSerpMapRoute,
	projectCockpitRoute,
	projectCtrAnomaliesRoute,
	projectLostOpportunityRoute,
	projectSchedulesRoute,
	projectGscPropertiesRoute,
	projectGscPerformanceRoute,
	projectGa4PropertiesRoute,
	projectGa4TrafficRoute,
	projectBrandPromptsRoute,
	projectAiSearchCitationsRoute,
	projectAiSearchMatrixRoute,
	projectAiRadarRoute,
	projectCompetitorsRoute,
	projectScorecardRoute,
	projectOpportunitiesRoute,
	projectGapAnalysisRoute,
	projectActionsRoute,
	projectCannibalizationRoute,
	credentialsRoute,
	portfoliosRoute,
	portfolioCompareRoute,
]);

export const router = new Router({
	routeTree,
	defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
