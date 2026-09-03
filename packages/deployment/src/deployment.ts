/**
 * The singleton is cached at module scope. On Vercel serverless this persists
 * across warm invocations, which is safe because the Deployment object contains
 * no request-scoped state.
 *
 * This module stays Node-safe: branding is assembled from env alone, so the
 * worker builds a Deployment without pulling in the React OptimizeButton.
 */

import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL, DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { getDeploymentModeFromEnv, getEnv, requireEnvVars } from "@workspace/config/env";
import type { BrandingConfig, Deployment, DeploymentMode, FeaturesConfig } from "@workspace/config/types";

type Env = Record<string, string | undefined>;

export const FEATURES_BY_MODE: Record<DeploymentMode, FeaturesConfig> = {
	local: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: true,
		platformPicksEditable: true,
		canEditOrganizations: true,
		canCreateOrganizations: false,
		selfServeSignup: false,
		billing: false,
		reportGeneration: true,
		teamInvites: false,
	},
	demo: {
		readOnly: true,
		showOptimizeButton: false,
		canCreateBrands: false,
		platformPicksEditable: false,
		canEditOrganizations: false,
		canCreateOrganizations: false,
		selfServeSignup: false,
		billing: false,
		reportGeneration: true,
		teamInvites: false,
	},
	whitelabel: {
		readOnly: false,
		showOptimizeButton: true,
		canCreateBrands: false,
		platformPicksEditable: false,
		canEditOrganizations: false,
		canCreateOrganizations: false,
		selfServeSignup: false,
		billing: false,
		reportGeneration: true,
		teamInvites: false,
	},
	cloud: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: true,
		platformPicksEditable: true,
		canEditOrganizations: true,
		canCreateOrganizations: true,
		selfServeSignup: true,
		billing: true,
		reportGeneration: false,
		teamInvites: true,
	},
};

function parseChartColors(raw: string | undefined): string[] | undefined {
	if (!raw) return undefined;
	const colors = raw
		.split(",")
		.map((c) => c.trim())
		.filter(Boolean);
	return colors.length > 0 ? colors : undefined;
}

function whitelabelBranding(env: Env): BrandingConfig {
	const requiredEnv = requireEnvVars(
		["VITE_APP_NAME", "VITE_APP_ICON", "VITE_APP_URL", "VITE_OPTIMIZATION_URL_TEMPLATE"],
		env,
	);
	const redirectTemplate = env.VITE_ONBOARDING_REDIRECT_URL_TEMPLATE;

	return {
		name: requiredEnv.VITE_APP_NAME,
		icon: requiredEnv.VITE_APP_ICON,
		url: requiredEnv.VITE_APP_URL,
		parentName: env.VITE_APP_PARENT_NAME,
		parentUrl: env.VITE_APP_PARENT_URL,
		onboardingRedirectUrl: redirectTemplate
			? (brandId: string) => redirectTemplate.replace("{brandId}", brandId)
			: undefined,
		onboardingRedirectUrlTemplate: redirectTemplate,
		optimizationUrlTemplate: requiredEnv.VITE_OPTIMIZATION_URL_TEMPLATE,
		chartColors: parseChartColors(env.VITE_CHART_COLORS) ?? DEFAULT_CHART_COLORS,
	};
}

function brandingFor(mode: DeploymentMode, env: Env): BrandingConfig {
	if (mode === "whitelabel") return whitelabelBranding(env);

	// The localhost URL fallback keeps this total: a missing APP_URL surfaces on
	// the env-validation page rather than throwing here.
	if (mode === "cloud") {
		return {
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: getEnv("APP_URL", DEFAULT_APP_URL, env),
			chartColors: DEFAULT_CHART_COLORS,
		};
	}

	return {
		name: getEnv("APP_NAME", DEFAULT_APP_NAME, env),
		icon: getEnv("APP_ICON", DEFAULT_APP_ICON, env),
		url: getEnv("APP_URL", DEFAULT_APP_URL, env),
		parentName: env.APP_PARENT_NAME,
		parentUrl: env.APP_PARENT_URL,
		chartColors: DEFAULT_CHART_COLORS,
	};
}

export function buildDeployment(requestedMode: DeploymentMode, env: Env): Deployment {
	const mode = requestedMode === "local" && env.READ_ONLY === "true" ? "demo" : requestedMode;
	return {
		mode,
		features: FEATURES_BY_MODE[mode],
		branding: brandingFor(mode, env),
	};
}

let cached: Deployment | null = null;

export interface GetDeploymentOptions {
	env?: Env;
}

export function getDeployment(options?: GetDeploymentOptions): Deployment {
	if (cached) return cached;

	const env = options?.env ?? process.env;
	cached = buildDeployment(getDeploymentModeFromEnv(env), env);
	return cached;
}

/**
 * Reset the cached deployment instance.
 * Only used in tests to switch between deployment modes.
 */
export function resetDeploymentCache(): void {
	cached = null;
}
