import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";

export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

export interface FeaturesConfig {
	readOnly: boolean;
	showOptimizeButton: boolean;
	canCreateBrands: boolean;
	promotesCloud?: boolean;
	/** Cloud only: gates the Billing nav item and the billing/paywall routes. */
	billing?: boolean;
	teamInvites?: boolean;
	reportGeneration?: boolean;
	selfServeSignup?: boolean;
}

export interface BrandingConfig {
	name: string;
	icon?: string;
	url?: string;
	parentName?: string;
	parentUrl?: string;
	onboardingRedirectUrl?: string;
	optimizationUrlTemplate?: string;
	chartColors: string[];
}

export interface AnalyticsConfig {
	plausibleDomain?: string;
	clarityProjectId?: string;
	crispWebsiteId?: string;
}

export interface ClientConfig {
	mode: DeploymentMode;
	features: FeaturesConfig;
	branding: BrandingConfig;
	analytics: AnalyticsConfig;
	defaultDelayHours: number;
	canRegister: boolean;
	hasUsers: boolean;
}

let _config: ClientConfig = {
	mode: "local",
	features: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: false,
	},
	branding: {
		name: "Elmo",
		chartColors: DEFAULT_CHART_COLORS,
	},
	analytics: {},
	defaultDelayHours: 24,
	canRegister: false,
	hasUsers: true,
};

export function setMockClientConfig(config: ClientConfig) {
	_config = config;
}

/** Components import `clientConfig` once, so it reads through to whatever a story set last. */
export const clientConfig: ClientConfig = new Proxy({} as ClientConfig, {
	get(_target, prop: string) {
		return (_config as unknown as Record<string, unknown>)[prop];
	},
});

export { _config as getDeployment };
