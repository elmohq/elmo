export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

export interface FeaturesConfig {
	readOnly: boolean;
	showOptimizeButton: boolean;
	/**
	 * Whether the user can create new brands from the UI. True in local and
	 * cloud modes — whitelabel brands come from the admin API, demo is read-only.
	 */
	canCreateBrands: boolean;
	/**
	 * Whether public self-serve registration is available. True only in cloud
	 * mode. Local allows a single bootstrap signup (see ClientConfig.canRegister);
	 * demo/whitelabel never expose signup.
	 */
	selfServeSignup: boolean;
	/**
	 * Whether Stripe subscription billing is active. True only in cloud mode.
	 * Gates the billing/usage surfaces and plan enforcement.
	 */
	billing: boolean;
	/**
	 * Whether the one-time report generator is available. True everywhere except
	 * cloud, where reports are disabled entirely (no worker scheduling, no UI
	 * entry points, and the per-user hasReportGeneratorAccess flag is ignored).
	 */
	reportGeneration: boolean;
	/**
	 * Whether org admins can invite teammates by email. True only in cloud —
	 * local is single-user by design, whitelabel memberships come from Auth0,
	 * demo is read-only.
	 */
	teamInvites: boolean;
	/**
	 * Whether the person looking at a brand chooses which platforms it is
	 * tracked on. True in local and cloud, where the viewer either runs the
	 * deployment or buys the choice; false in whitelabel, where the picks and
	 * the provider bills behind them are the agency's, and in demo, which
	 * refuses every write.
	 *
	 * Carries the same value as `canCreateBrands` in all four modes today and is
	 * still its own flag: they answer to different owners. Brand creation is
	 * provisioning, which cloud sells per brand and an agency keeps to itself;
	 * this is about spending a provider budget, which cloud sells as part of a
	 * plan. A tier that provisioned brands without letting a customer retarget
	 * them, or the reverse, would move one and not the other.
	 */
	platformPicksEditable: boolean;
}

export interface AnalyticsConfig {
	plausibleDomain?: string;
	clarityProjectId?: string;
	posthogKey?: string;
	/** Only set on deployments we operate (cloud and demo). */
	crispWebsiteId?: string;
}

export interface BrandingConfig {
	name: string;
	icon: string;
	url: string;
	parentName?: string;
	parentUrl?: string;
	onboardingRedirectUrl?: (brandId: string) => string | undefined;
	/** Serializable form of the onboarding redirect, with a `{brandId}` placeholder. */
	onboardingRedirectUrlTemplate?: string;
	/** Supports `{brandId}`, `{prompt}`, and `{webQuery}` placeholders. */
	optimizationUrlTemplate?: string;
	chartColors: string[];
}

export interface Deployment {
	mode: DeploymentMode;
	features: FeaturesConfig;
	branding: BrandingConfig;
}

/** Serializable deployment configuration exposed to browser code. */
export interface ClientConfig {
	mode: DeploymentMode;
	features: FeaturesConfig;
	branding: BrandingConfig;
	analytics: AnalyticsConfig;
	/** Prompt cadence in hours when a brand has no override. */
	defaultDelayHours: number;
	/**
	 * Whether /auth/register should be reachable. True in cloud mode (self-serve
	 * signup) and in local mode before the first user is bootstrapped.
	 * Demo/whitelabel always false.
	 */
	canRegister: boolean;
	hasUsers: boolean;
}

export interface WebQueryResult {
	/** Top web query over the requested window, for the requested model. */
	webQuery: string | null;
}

export interface OptimizeButtonProps {
	brandId?: string;
	selectedModel?: string;
	availableModels: string[];
	lookback?: "1w" | "1m" | "3m" | "6m" | "1y" | "all";
	promptName?: string;
	promptId?: string;
	parentName?: string;
	optimizationUrlTemplate?: string;
	fetchWebQuery?: (promptId: string, lookback: string, model?: string) => Promise<WebQueryResult>;
}

export interface EnvRequirement {
	id: string;
	label: string;
	description?: string;
	isSatisfied: (env: Record<string, string | undefined>) => boolean;
}
