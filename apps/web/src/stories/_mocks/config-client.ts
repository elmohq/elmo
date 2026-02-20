/**
 * Mock for @/lib/config/client — provides a controllable clientConfig.
 *
 * Components import `clientConfig` directly from this module.
 * Stories call `setMockClientConfig()` before rendering to control values.
 */

export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

export interface FeaturesConfig {
	readOnly: boolean;
	showOptimizeButton: boolean;
	supportsMultiOrg: boolean;
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
}

export interface ClientConfig {
	mode: DeploymentMode;
	features: FeaturesConfig;
	branding: BrandingConfig;
	analytics: AnalyticsConfig;
	defaultOrganization?: string;
}

// Default chart colors matching the theme
const DEFAULT_CHART_COLORS = [
	"hsl(217, 91%, 60%)", // Blue (brand)
	"hsl(142, 71%, 45%)", // Green
	"hsl(38, 92%, 50%)", // Orange
	"hsl(0, 84%, 60%)", // Red
	"hsl(280, 87%, 65%)", // Purple
	"hsl(190, 90%, 50%)", // Cyan
];

// ---------------------------------------------------------------------------
// Module-level config that stories can mutate
// ---------------------------------------------------------------------------

let _config: ClientConfig = {
	mode: "local",
	features: {
		readOnly: false,
		showOptimizeButton: false,
		supportsMultiOrg: false,
	},
	branding: {
		name: "Elmo",
		chartColors: DEFAULT_CHART_COLORS,
	},
	analytics: {},
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
