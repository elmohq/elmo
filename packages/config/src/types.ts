export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

export interface FeaturesConfig {
	readOnly: boolean;
	/** Elmo's hosted demo, not a self-hosted install made read-only with READ_ONLY=true. */
	promotesCloud: boolean;
	showOptimizeButton: boolean;
	/** Off in whitelabel, whose brands come from the admin API, and in demo. */
	canCreateBrands: boolean;
	canCreateOrganizations: boolean;
	canEditOrganizations: boolean;
	/** Cloud only; local allows just the bootstrap signup (see ClientConfig.canRegister). */
	selfServeSignup: boolean;
	/** Cloud only. Gates the billing surfaces and plan enforcement. */
	billing: boolean;
	/** Off in cloud, where even the per-user hasReportGeneratorAccess flag is ignored. */
	reportGeneration: boolean;
	/** Cloud only: local is single-user and whitelabel memberships come from Auth0. */
	teamInvites: boolean;
	/**
	 * Off in whitelabel, where the agency picks and pays the provider bills. Kept
	 * apart from `canCreateBrands` because the two are sold as different things.
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
	/** Cloud, and local until the first user is bootstrapped. */
	canRegister: boolean;
	hasUsers: boolean;
	turnstileSiteKey?: string;
}

export interface WebQueryResult {
	/** Top web query over the requested window, for the requested model. */
	webQuery: string | null;
}

export interface OptimizeButtonProps {
	brandId?: string;
	selectedModel?: string;
	availableModels: string[];
	/** A lookback preset or a `YYYY-MM-DD..YYYY-MM-DD` custom range. */
	lookback?: string;
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
