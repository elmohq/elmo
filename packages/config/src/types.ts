/**
 * Core types and interfaces for deployment configuration
 *
 * This package defines the contracts that all deployment mode implementations must follow.
 * Actual implementations live in local, whitelabel, etc.
 *
 * Auth-related runtime methods (getSession, isAdmin, organizations, etc.) have been
 * removed — those are now handled by better-auth. The Deployment interface only carries
 * static configuration used by middleware and the client.
 */

/**
 * Deployment modes supported by the application
 */
export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

/**
 * Feature flags for deployment modes
 */
export interface FeaturesConfig {
	/** Block all write operations (demo mode) */
	readOnly: boolean;
	/** Whether the optimize button should be shown */
	showOptimizeButton: boolean;
	/** Whether multi-org brand switching is supported */
	supportsMultiOrg: boolean;
	/**
	 * Whether the user can create new brands from the UI. True in local and
	 * cloud modes — whitelabel orgs come from Auth0, demo is read-only.
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
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
	/** Plausible analytics domain (optional) */
	plausibleDomain?: string;
	/** Microsoft Clarity project ID (optional) */
	clarityProjectId?: string;
	/** PostHog project API key (optional) */
	posthogKey?: string;
}

/**
 * Branding configuration
 */
export interface BrandingConfig {
	/** Application name */
	name: string;
	/** Path to the application icon */
	icon: string;
	/** Application URL */
	url: string;
	/** Parent company name (optional) */
	parentName?: string;
	/** Parent company URL (optional) */
	parentUrl?: string;
	/** Callback to generate onboarding redirect URL with brandId (optional, redirects after PromptWizard completion) */
	onboardingRedirectUrl?: (brandId: string) => string | undefined;
	/** Raw URL template for onboarding redirect with {brandId} placeholder (serializable, for client use) */
	onboardingRedirectUrlTemplate?: string;
	/** URL template for optimization links with placeholders: {brandId}, {prompt}, {webQuery} (optional, whitelabel only) */
	optimizationUrlTemplate?: string;
	/** Chart color palette */
	chartColors: string[];
}

// ============================================================================
// Deployment Interface
// ============================================================================

/**
 * The main deployment interface. Each deployment mode implements this.
 *
 * This is now a pure configuration object — all auth-related runtime
 * behaviour (sessions, org access, admin checks) lives in better-auth.
 */
export interface Deployment {
	/** Current deployment mode */
	mode: DeploymentMode;
	/** Feature flags */
	features: FeaturesConfig;
	/** Branding configuration */
	branding: BrandingConfig;
}

// ============================================================================
// Client Config (Browser-Safe)
// ============================================================================

/**
 * Client-safe configuration that can be used in browser code.
 * Does NOT include runtime methods or server-side dependencies.
 */
export interface ClientConfig {
	/** Current deployment mode */
	mode: DeploymentMode;
	/** Feature flags */
	features: FeaturesConfig;
	/** Branding configuration */
	branding: BrandingConfig;
	/** Analytics configuration */
	analytics: AnalyticsConfig;
	/** Resolved default prompt cadence (hours) for brands without a delayOverrideHours */
	defaultDelayHours: number;
	/**
	 * Whether /auth/register should be reachable. True in cloud mode (self-serve
	 * signup) and in local mode before the first user is bootstrapped.
	 * Demo/whitelabel always false.
	 */
	canRegister: boolean;
	/** Whether any user account exists. */
	hasUsers: boolean;
}

// ============================================================================
// OptimizeButton Shared Types
// ============================================================================

export interface WebQueryResult {
	webQuery: string | null;
	modelWebQueries: Record<string, string>;
}

export interface OptimizeButtonProps {
	brandId?: string;
	selectedModel?: string;
	availableModels?: string[];
	lookback?: "1w" | "1m" | "3m" | "6m" | "1y" | "all";
	promptName?: string;
	promptId?: string;
	parentName?: string;
	optimizationUrlTemplate?: string;
	fetchWebQuery?: (promptId: string, lookback: string, model?: string) => Promise<WebQueryResult>;
}

// ============================================================================
// Environment Requirements
// ============================================================================

/**
 * Environment variable requirement
 */
export interface EnvRequirement {
	/** Unique identifier */
	id: string;
	/** Human-readable label */
	label: string;
	/** Description of what this env var is for */
	description?: string;
	/** Check if the requirement is satisfied */
	isSatisfied: (env: Record<string, string | undefined>) => boolean;
}
