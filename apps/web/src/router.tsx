import {
	Outlet,
	type RootRoute,
	Router,
	createRootRoute,
	createRoute,
	redirect,
} from '@tanstack/react-router';
import { useAuthStore } from './lib/auth-store.js';
import { CredentialsPage } from './pages/credentials.page.js';
import { LoginPage } from './pages/login.page.js';
import { ProjectDetailPage } from './pages/project-detail.page.js';
import { ProjectsPage } from './pages/projects.page.js';
import { RankingsPage } from './pages/rankings.page.js';
import { RegisterPage } from './pages/register.page.js';

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

const credentialsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/credentials',
	component: CredentialsPage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	loginRoute,
	registerRoute,
	projectsRoute,
	projectDetailRoute,
	projectRankingsRoute,
	credentialsRoute,
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
