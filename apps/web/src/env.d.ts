/// <reference types="vite/client" />

interface ImportMetaEnv {
	// Deployment mode
	readonly VITE_DEPLOYMENT_MODE: string;

	// Branding (whitelabel only - local/demo use server-side defaults)
	readonly VITE_APP_NAME?: string;
	readonly VITE_APP_ICON?: string;
	readonly VITE_APP_URL?: string;
	readonly VITE_APP_PARENT_NAME?: string;
	readonly VITE_APP_PARENT_URL?: string;
	readonly VITE_OPTIMIZATION_URL_TEMPLATE?: string;
	readonly VITE_ONBOARDING_REDIRECT_URL_TEMPLATE?: string;
	readonly VITE_CHART_COLORS?: string;

	// Analytics
	readonly VITE_PLAUSIBLE_DOMAIN?: string;
	readonly VITE_CLARITY_PROJECT_ID?: string;
	readonly VITE_POSTHOG_KEY?: string;

	// Sentry
	readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Server-side environment variables (accessed via process.env in server functions)
// and Vite define globals
declare global {
	// App version injected by Vite define
	const __APP_VERSION__: string;
	namespace NodeJS {
		interface ProcessEnv {
			readonly DEPLOYMENT_MODE: string;
			readonly DATABASE_URL: string;
			readonly OPENAI_API_KEY: string;
			readonly ANTHROPIC_API_KEY: string;
			readonly DATAFORSEO_LOGIN: string;
			readonly DATAFORSEO_PASSWORD: string;
			readonly BETTER_AUTH_SECRET?: string;
			readonly DEFAULT_ORG_ID?: string;
			readonly DEFAULT_ORG_NAME?: string;
			readonly AUTH0_MGMT_API_DOMAIN?: string;
			readonly AUTH0_CLIENT_ID?: string;
			readonly AUTH0_CLIENT_SECRET?: string;
			readonly ADMIN_API_KEYS?: string;
			readonly DEFAULT_BRAND_DOMAINS?: string;
			readonly ENVIRONMENT?: string;
			readonly SENTRY_DSN?: string;
			readonly DISABLE_TELEMETRY?: string;
		}
	}
}

export {};
