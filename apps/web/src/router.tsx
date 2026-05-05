import {
	createRootRoute,
	createRoute,
	Outlet,
	type RootRoute,
	Router,
	redirect,
} from '@tanstack/react-router';
import { useAuthStore } from './lib/auth-store.js';
import { CredentialsPage } from './pages/credentials.page.js';
import { GscPerformancePage } from './pages/gsc-performance.page.js';
import { GscPropertiesPage } from './pages/gsc-properties.page.js';
import { LoginPage } from './pages/login.page.js';
import { PortfoliosPage } from './pages/portfolios.page.js';
import { ProjectDetailPage } from './pages/project-detail.page.js';
import { ProjectsPage } from './pages/projects.page.js';
import { RankingsPage } from './pages/rankings.page.js';
import { RegisterPage } from './pages/register.page.js';
import { SchedulesPage } from './pages/schedules.page.js';

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

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginPage,
});

const registerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/register',
	component: RegisterPage,
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

const routeTree = rootRoute.addChildren([
	indexRoute,
	loginRoute,
	registerRoute,
	projectsRoute,
	projectDetailRoute,
	projectRankingsRoute,
	projectSchedulesRoute,
	projectGscPropertiesRoute,
	projectGscPerformanceRoute,
	credentialsRoute,
	portfoliosRoute,
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
