/**
 * Mock for @/lib/config/client — provides a controllable clientConfig.
 *
 * Components import `clientConfig` directly from this module.
 * Stories call `setMockClientConfig()` before rendering to control values.
 */

import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";

export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

export interface FeaturesConfig {
	readOnly: boolean;
	showOptimizeButton: boolean;
	canCreateBrands: boolean;
	/** Cloud only: gates the Billing nav item and the billing/paywall routes. */
	billing?: boolean;
	teamInvites?: boolean;
	teamManagement?: boolean;
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

// ---------------------------------------------------------------------------
// Module-level config that stories can mutate
// ---------------------------------------------------------------------------

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

/**
 * Proxy-like object that always reads from the current `_config`.
 * This ensures that stories calling `setMockClientConfig` before render
 * will have the updated config read by child components.
 */
export const clientConfig: ClientConfig = new Proxy({} as ClientConfig, {
	get(_target, prop: string) {
		return (_config as unknown as Record<string, unknown>)[prop];
	},
});

export { _config as getDeployment };
