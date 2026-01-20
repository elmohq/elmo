import type { DeploymentMode } from "./types";

type EnvMap = Record<string, string | undefined>;

export interface EnvRequirement {
	id: string;
	label: string;
	description?: string;
	isSatisfied: (env: EnvMap) => boolean;
}

export interface MissingEnvVar {
	id: string;
	label: string;
	description?: string;
}

const hasValue = (value: string | undefined): boolean =>
	typeof value === "string" && value.trim().length > 0;

const requireAll =
	(keys: string[]) =>
	(env: EnvMap): boolean =>
		keys.every((key) => hasValue(env[key]));

const COMMON_REQUIREMENTS: EnvRequirement[] = [
	{
		id: "DATABASE_URL",
		label: "DATABASE_URL",
		description: "PostgreSQL connection string.",
		isSatisfied: requireAll(["DATABASE_URL"]),
	},
	{
		id: "UPSTASH_REDIS_REST_URL",
		label: "UPSTASH_REDIS_REST_URL",
		description: "Upstash Redis REST URL.",
		isSatisfied: requireAll(["UPSTASH_REDIS_REST_URL"]),
	},
	{
		id: "UPSTASH_REDIS_REST_TOKEN",
		label: "UPSTASH_REDIS_REST_TOKEN",
		description: "Upstash Redis REST token.",
		isSatisfied: requireAll(["UPSTASH_REDIS_REST_TOKEN"]),
	},
	{
		id: "UPSTASH_REDIS_ENDPOINT",
		label: "UPSTASH_REDIS_ENDPOINT",
		description:
			"Redis host for BullMQ queues (e.g., 'redis' for Docker or 'xxx.upstash.io' for Upstash).",
		isSatisfied: requireAll(["UPSTASH_REDIS_ENDPOINT"]),
	},
	{
		id: "ANTHROPIC_API_KEY",
		label: "ANTHROPIC_API_KEY",
		description: "Anthropic API key.",
		isSatisfied: requireAll(["ANTHROPIC_API_KEY"]),
	},
	{
		id: "OPENAI_API_KEY",
		label: "OPENAI_API_KEY",
		description: "OpenAI API key.",
		isSatisfied: requireAll(["OPENAI_API_KEY"]),
	},
	{
		id: "DATAFORSEO_LOGIN",
		label: "DATAFORSEO_LOGIN",
		description: "DataForSEO username.",
		isSatisfied: requireAll(["DATAFORSEO_LOGIN"]),
	},
	{
		id: "DATAFORSEO_PASSWORD",
		label: "DATAFORSEO_PASSWORD",
		description: "DataForSEO password.",
		isSatisfied: requireAll(["DATAFORSEO_PASSWORD"]),
	},
	{
		id: "TINYBIRD_TOKEN",
		label: "TINYBIRD_TOKEN",
		description: "Tinybird API token.",
		isSatisfied: requireAll(["TINYBIRD_TOKEN"]),
	},
	{
		id: "TINYBIRD_BASE_URL",
		label: "TINYBIRD_BASE_URL",
		description: "Tinybird base URL.",
		isSatisfied: requireAll(["TINYBIRD_BASE_URL"]),
	},
];

const LOCAL_DEMO_REQUIREMENTS: EnvRequirement[] = [
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

const AUTH0_REQUIREMENTS: EnvRequirement[] = [
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

export const ENV_REQUIREMENTS: Record<DeploymentMode, EnvRequirement[]> = {
	local: [...COMMON_REQUIREMENTS, ...LOCAL_DEMO_REQUIREMENTS],
	demo: [...COMMON_REQUIREMENTS, ...LOCAL_DEMO_REQUIREMENTS],
	whitelabel: [...COMMON_REQUIREMENTS, ...AUTH0_REQUIREMENTS],
	cloud: [], // todo
};

export function getDeploymentModeFromEnv(
	env: EnvMap = process.env,
): DeploymentMode {
	const mode = env.DEPLOYMENT_MODE?.toLowerCase();
	if (mode === "local" || mode === "demo" || mode === "cloud") {
		return mode;
	}
	return "whitelabel";
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
