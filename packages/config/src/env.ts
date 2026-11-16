import { ENV_REGISTRY, RESEARCH_PROVIDER_PREFERENCE } from "./env-registry";
import { parseScrapeTargets } from "./scrape-targets";
import type { DeploymentMode, EnvRequirement } from "./types";

export type EnvMap = Record<string, string | undefined>;

export interface MissingEnvVar {
	id: string;
	label: string;
	description?: string;
}

export const hasValue = (value: string | undefined): boolean => typeof value === "string" && value.trim().length > 0;

export const requireAll =
	(keys: string[]) =>
	(env: EnvMap): boolean =>
		keys.every((key) => hasValue(env[key]));

export const requireAny =
	(keys: string[]) =>
	(env: EnvMap): boolean =>
		keys.some((key) => hasValue(env[key]));

export function createEnvRequirement(key: string, description?: string): EnvRequirement {
	return {
		id: key,
		label: key,
		description,
		isSatisfied: requireAll([key]),
	};
}

function buildStaticRequirements(mode: DeploymentMode): EnvRequirement[] {
	return ENV_REGISTRY.filter((spec) => Array.isArray(spec.requiredBy) && spec.requiredBy.includes(mode)).map((spec) =>
		createEnvRequirement(spec.name, spec.description),
	);
}

function providerKeys(provider: string): string[] {
	return ENV_REGISTRY.filter((spec) => spec.requiredBy === "dynamic-scrape-targets" && spec.provider === provider).map(
		(spec) => spec.name,
	);
}

function buildProviderKeyRequirements(env: EnvMap = process.env): EnvRequirement[] {
	let providers: string[];
	try {
		providers = [...new Set(parseScrapeTargets(env.SCRAPE_TARGETS).map((target) => target.provider))];
	} catch {
		// A malformed SCRAPE_TARGETS is reported by its own requirement.
		return [];
	}

	const requirements: EnvRequirement[] = [];
	for (const provider of providers) {
		const keys = providerKeys(provider);
		if (keys.length === 0) continue;
		requirements.push({
			id: `PROVIDER_${provider.toUpperCase().replace(/-/g, "_")}`,
			label: keys.join(" + "),
			description: `Required by SCRAPE_TARGETS provider "${provider}".`,
			isSatisfied: requireAll(keys),
		});
	}

	return requirements;
}

/**
 * Onboarding and the Opportunities report need a direct LLM API whatever
 * SCRAPE_TARGETS tracks; without this, a scrape-only deployment fails on first use.
 */
function buildResearchProviderRequirement(): EnvRequirement {
	const candidates = RESEARCH_PROVIDER_PREFERENCE.map(providerKeys);
	return {
		id: "RESEARCH_PROVIDER",
		label: candidates.map((keys) => keys.join(" + ")).join(" or "),
		description:
			"Needed for brand onboarding and the Opportunities report. Alternatively, set ONBOARDING_LLM_TARGET and that provider's keys.",
		isSatisfied: (env) => {
			const target = env.ONBOARDING_LLM_TARGET?.trim();
			if (!target) return candidates.some((keys) => requireAll(keys)(env));
			try {
				const [parsed] = parseScrapeTargets(target);
				return parsed !== undefined && requireAll(providerKeys(parsed.provider))(env);
			} catch {
				return false;
			}
		},
	};
}

function buildRequirements(mode: DeploymentMode): EnvRequirement[] {
	return [...buildStaticRequirements(mode), ...buildProviderKeyRequirements(), buildResearchProviderRequirement()];
}

export const ENV_REQUIREMENTS: Record<DeploymentMode, EnvRequirement[]> = {
	local: buildRequirements("local"),
	demo: buildRequirements("demo"),
	whitelabel: buildRequirements("whitelabel"),
	cloud: buildRequirements("cloud"),
};

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

function formatMissingEnvVars(keys: string[]): string {
	return keys.length === 1
		? `Missing required environment variable: ${keys[0]}`
		: `Missing required environment variables: ${keys.join(", ")}`;
}

/** Throws one error naming every missing key. */
export function requireEnvVars<const K extends string>(
	keys: readonly K[],
	env: EnvMap = process.env,
): Record<K, string> {
	const missing = keys.filter((key) => !hasValue(env[key]));
	if (missing.length > 0) {
		throw new Error(formatMissingEnvVars(missing));
	}
	return Object.fromEntries(keys.map((key) => [key, env[key]!])) as Record<K, string>;
}

// Provider keys are excluded: they can also come from stored credentials, so
// SCRAPE_TARGETS validation checks them once those are loaded.
export function assertRequiredEnv(env: EnvMap = process.env): void {
	const requirements = hasValue(env.DEPLOYMENT_MODE)
		? buildStaticRequirements(getDeploymentModeFromEnv(env))
		: buildStaticRequirements("local").filter((requirement) =>
				VALID_MODES.every((mode) => buildStaticRequirements(mode).some((other) => other.id === requirement.id)),
			);
	const missing = requirements
		.filter((requirement) => !requirement.isSatisfied(env))
		.map((requirement) => requirement.id);
	if (missing.length > 0) {
		throw new Error(formatMissingEnvVars(missing));
	}
}

export function getEnv(key: string, defaultValue: string, env: EnvMap = process.env): string {
	const value = env[key];
	return hasValue(value) ? value! : defaultValue;
}
