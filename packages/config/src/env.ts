import type { DeploymentMode, EnvRequirement } from "./types";

export type EnvMap = Record<string, string | undefined>;

export interface MissingEnvVar {
	id: string;
	label: string;
	description?: string;
}

/**
 * Check if an environment variable has a non-empty value
 */
export const hasValue = (value: string | undefined): boolean => typeof value === "string" && value.trim().length > 0;

/**
 * Create a requirement checker that requires all specified keys to have values
 */
export const requireAll =
	(keys: string[]) =>
	(env: EnvMap): boolean =>
		keys.every((key) => hasValue(env[key]));

/**
 * Create a requirement checker that is satisfied when any key has a value.
 */
export const requireAny =
	(keys: string[]) =>
	(env: EnvMap): boolean =>
		keys.some((key) => hasValue(env[key]));

/**
 * Create a simple env requirement for a single key
 */
export function createEnvRequirement(key: string, description?: string): EnvRequirement {
	return {
		id: key,
		label: key,
		description,
		isSatisfied: requireAll([key]),
	};
}

/**
 * Common environment requirements for all deployment modes
 */
export const COMMON_REQUIREMENTS: EnvRequirement[] = [
	{
		id: "BETTER_AUTH_SECRET",
		label: "BETTER_AUTH_SECRET",
		description: "Session cookie encryption secret.",
		isSatisfied: requireAll(["BETTER_AUTH_SECRET"]),
	},
	{
		id: "DATABASE_URL",
		label: "DATABASE_URL",
		description: "PostgreSQL connection string.",
		isSatisfied: requireAll(["DATABASE_URL"]),
	},
	{
		id: "SCRAPE_TARGETS",
		label: "SCRAPE_TARGETS",
		description: "Comma-separated engine:provider[:model][:online] entries. Example: chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online",
		isSatisfied: requireAll(["SCRAPE_TARGETS"]),
	},
	{
		id: "AI_PROVIDER",
		label: "At least one AI provider",
		description:
			"Configure at least one AI provider key referenced by SCRAPE_TARGETS: OLOSTEP_API_KEY (recommended), OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, BRIGHTDATA_API_TOKEN, or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.",
		isSatisfied: requireAny([
			"OLOSTEP_API_KEY",
			"OPENAI_API_KEY",
			"ANTHROPIC_API_KEY",
			"OPENROUTER_API_KEY",
			"BRIGHTDATA_API_TOKEN",
			"DATAFORSEO_LOGIN",
		]),
	},
];

/**
 * Environment requirements specific to local/demo modes
 */
export const LOCAL_DEMO_REQUIREMENTS: EnvRequirement[] = [
	{
		id: "DEFAULT_ORG_ID",
		label: "DEFAULT_ORG_ID",
		description: "Default organization ID.",
		isSatisfied: requireAll(["DEFAULT_ORG_ID"]),
	},
	{
		id: "DEFAULT_ORG_NAME",
		label: "DEFAULT_ORG_NAME",
		description: "Default organization name.",
		isSatisfied: requireAll(["DEFAULT_ORG_NAME"]),
	},
	// APP_NAME, APP_ICON, APP_URL are optional with defaults (see constants.ts)
];

/**
 * Environment requirements specific to Auth0/whitelabel mode
 */
export const AUTH0_REQUIREMENTS: EnvRequirement[] = [
	{
		id: "AUTH0_MGMT_API_DOMAIN",
		label: "AUTH0_MGMT_API_DOMAIN",
		description: "Auth0 Management API domain.",
		isSatisfied: requireAll(["AUTH0_MGMT_API_DOMAIN"]),
	},
	{
		id: "AUTH0_CLIENT_ID",
		label: "AUTH0_CLIENT_ID",
		description: "Auth0 client ID.",
		isSatisfied: requireAll(["AUTH0_CLIENT_ID"]),
	},
	{
		id: "AUTH0_CLIENT_SECRET",
		label: "AUTH0_CLIENT_SECRET",
		description: "Auth0 client secret.",
		isSatisfied: requireAll(["AUTH0_CLIENT_SECRET"]),
	},
];

/**
 * Environment requirements specific to whitelabel branding
 * All branding values must be provided - no defaults allowed
 *
 * TanStack Start uses VITE_* for client-side env vars.
 */
export const WHITELABEL_BRANDING_REQUIREMENTS: EnvRequirement[] = [
	{
		id: "VITE_APP_NAME",
		label: "VITE_APP_NAME",
		description: "Application display name (e.g., 'Acme AI Search').",
		isSatisfied: requireAll(["VITE_APP_NAME"]),
	},
	{
		id: "VITE_APP_ICON",
		label: "VITE_APP_ICON",
		description: "Application icon URL (must be an external URL, e.g., 'https://cdn.example.com/icon.png').",
		isSatisfied: requireAll(["VITE_APP_ICON"]),
	},
	{
		id: "VITE_APP_URL",
		label: "VITE_APP_URL",
		description: "Application URL (e.g., 'https://ai.example.com/').",
		isSatisfied: requireAll(["VITE_APP_URL"]),
	},
	{
		id: "VITE_APP_PARENT_NAME",
		label: "VITE_APP_PARENT_NAME",
		description: "Parent application name (e.g., 'Acme').",
		isSatisfied: requireAll(["VITE_APP_PARENT_NAME"]),
	},
	{
		id: "VITE_APP_PARENT_URL",
		label: "VITE_APP_PARENT_URL",
		description: "Parent application URL (e.g., 'https://app.example.com/').",
		isSatisfied: requireAll(["VITE_APP_PARENT_URL"]),
	},
	{
		id: "VITE_OPTIMIZATION_URL_TEMPLATE",
		label: "VITE_OPTIMIZATION_URL_TEMPLATE",
		description:
			"URL template for optimization with placeholders {brandId}, {prompt}, {webQuery} (e.g., 'https://app.example.com/optimize?org_id={brandId}&prompt={prompt}&web_query={webQuery}').",
		isSatisfied: requireAll(["VITE_OPTIMIZATION_URL_TEMPLATE"]),
	},
	// VITE_ONBOARDING_REDIRECT_URL_TEMPLATE is optional - only needed if you want to redirect
	// users to the parent app after completing onboarding. Uses {brandId} placeholder.
];

export const ENV_REQUIREMENTS: Record<DeploymentMode, EnvRequirement[]> = {
	local: [...COMMON_REQUIREMENTS, ...LOCAL_DEMO_REQUIREMENTS],
	demo: [...COMMON_REQUIREMENTS, ...LOCAL_DEMO_REQUIREMENTS],
	whitelabel: [...COMMON_REQUIREMENTS, ...AUTH0_REQUIREMENTS, ...WHITELABEL_BRANDING_REQUIREMENTS],
	cloud: [], // todo
};

/**
 * Get the deployment mode from environment variables
 *
 * Defaults to "local" for OSS builds. The build system should set
 * DEPLOYMENT_MODE appropriately for each environment.
 */
const VALID_MODES: DeploymentMode[] = ["local", "demo", "whitelabel", "cloud"];

export function getDeploymentModeFromEnv(env: EnvMap = process.env): DeploymentMode {
	const mode = env.DEPLOYMENT_MODE?.toLowerCase();

	if (!mode) {
		throw new Error("DEPLOYMENT_MODE environment variable is required");
	}

	if (!VALID_MODES.includes(mode as DeploymentMode)) {
		throw new Error(`Invalid DEPLOYMENT_MODE: "${mode}". Must be one of: ${VALID_MODES.join(", ")}`);
	}

	return mode as DeploymentMode;
}

export function getEnvRequirements(mode: DeploymentMode): EnvRequirement[] {
	return ENV_REQUIREMENTS[mode];
}

export function getEnvValidationState(env: EnvMap = process.env): {
	mode: DeploymentMode;
	requirements: EnvRequirement[];
	missing: MissingEnvVar[];
	isValid: boolean;
} {
	const mode = getDeploymentModeFromEnv(env);
	const requirements = getEnvRequirements(mode);
	const missing = requirements
		.filter((requirement) => !requirement.isSatisfied(env))
		.map((requirement) => ({
			id: requirement.id,
			label: requirement.label,
			description: requirement.description,
		}));

	return {
		mode,
		requirements,
		missing,
		isValid: missing.length === 0,
	};
}

/**
 * Validate environment variables against a specific set of requirements
 * Used by deployment packages to validate their specific requirements
 */
export function validateEnvRequirements(
	requirements: EnvRequirement[],
	env: EnvMap = process.env,
): {
	missing: MissingEnvVar[];
	isValid: boolean;
} {
	const missing = requirements
		.filter((requirement) => !requirement.isSatisfied(env))
		.map((requirement) => ({
			id: requirement.id,
			label: requirement.label,
			description: requirement.description,
		}));

	return {
		missing,
		isValid: missing.length === 0,
	};
}

/**
 * Get a required environment variable or throw an error
 */
export function requireEnv(key: string, env: EnvMap = process.env): string {
	const value = env[key];
	if (!hasValue(value)) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value!;
}

/**
 * Get an optional environment variable with a default value
 */
export function getEnv(key: string, defaultValue: string, env: EnvMap = process.env): string {
	const value = env[key];
	return hasValue(value) ? value! : defaultValue;
}
