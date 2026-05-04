import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

const en = {
	common: {
		appName: 'RankPulse',
		loading: 'Loading…',
		signIn: 'Sign in',
		signOut: 'Sign out',
		signUp: 'Create account',
		email: 'Email',
		password: 'Password',
		name: 'Full name',
		organization: 'Organization name',
		slug: 'Slug',
		create: 'Create',
		cancel: 'Cancel',
		retry: 'Retry',
		searchPlaceholder: 'Search…',
	},
	auth: {
		loginTitle: 'Sign in to RankPulse',
		loginSubtitle: 'Use your email and password.',
		registerTitle: 'Create your organization',
		registerSubtitle: 'You will be the owner. Invite teammates later.',
		dontHaveAccount: "Don't have an account?",
		alreadyHaveAccount: 'Already have an account?',
		invalidCredentials: 'Invalid email or password',
	},
	projects: {
		title: 'Projects',
		empty: 'No projects yet',
		emptyDescription: 'Create your first project to start tracking domains, keywords and competitors.',
		newProject: 'New project',
		primaryDomain: 'Primary domain',
		kind: 'Kind',
		create: 'Create project',
		nameLabel: 'Project name',
		domainLabel: 'Primary domain',
		domainHint: 'Bare domain, e.g. controlrondas.com',
	},
} as const;

const es = {
	common: {
		appName: 'RankPulse',
		loading: 'Cargando…',
		signIn: 'Entrar',
		signOut: 'Salir',
		signUp: 'Crear cuenta',
		email: 'Email',
		password: 'Contraseña',
		name: 'Nombre completo',
		organization: 'Nombre de la organización',
		slug: 'Slug',
		create: 'Crear',
		cancel: 'Cancelar',
		retry: 'Reintentar',
		searchPlaceholder: 'Buscar…',
	},
	auth: {
		loginTitle: 'Entra en RankPulse',
		loginSubtitle: 'Usa tu email y contraseña.',
		registerTitle: 'Crea tu organización',
		registerSubtitle: 'Serás el propietario. Podrás invitar a tu equipo más tarde.',
		dontHaveAccount: '¿No tienes cuenta?',
		alreadyHaveAccount: '¿Ya tienes cuenta?',
		invalidCredentials: 'Email o contraseña inválidos',
	},
	projects: {
		title: 'Proyectos',
		empty: 'Aún no hay proyectos',
		emptyDescription: 'Crea tu primer proyecto para empezar a monitorizar dominios, keywords y competidores.',
		newProject: 'Nuevo proyecto',
		primaryDomain: 'Dominio principal',
		kind: 'Tipo',
		create: 'Crear proyecto',
		nameLabel: 'Nombre del proyecto',
		domainLabel: 'Dominio principal',
		domainHint: 'Dominio sin protocolo, ej. controlrondas.com',
	},
} as const;

void i18next
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		fallbackLng: 'en',
		supportedLngs: ['en', 'es'],
		ns: ['common', 'auth', 'projects'],
		defaultNS: 'common',
		resources: { en, es },
		interpolation: { escapeValue: false },
	});

export const i18n = i18next;
