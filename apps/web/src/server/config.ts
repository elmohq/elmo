/**
 * Server functions for providing deployment configuration to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDeployment } from "@/lib/config/server";
import type { ClientConfig } from "@workspace/config/types";
import { getEnvValidationState } from "@workspace/config/env";

export type PublicClientConfig = Omit<ClientConfig, "branding"> & {
	branding: Omit<ClientConfig["branding"], "onboardingRedirectUrl"> & {
		onboardingRedirectUrl?: undefined;
	};
};

/**
 * Get the client-safe deployment configuration.
 * This server function is called in the root route's loader
 * so the config is available to all routes via context.
 *
 * IMPORTANT: The return value must be fully serializable (no functions, classes, etc.).
 * BrandingConfig.onboardingRedirectUrl is a function, so we strip it and send the
 * raw template string instead. The client can reconstruct the function if needed.
 */
export const getPublicClientConfig = createServerFn({ method: "GET" }).handler(async (): Promise<PublicClientConfig> => {
	const deployment = getDeployment();

	const { onboardingRedirectUrl, ...serializableBranding } = deployment.branding;

	return {
		mode: deployment.mode,
		features: deployment.features,
		branding: {
			...serializableBranding,
			onboardingRedirectUrl: undefined,
		},
		analytics: {
			plausibleDomain: process.env.VITE_PLAUSIBLE_DOMAIN,
			clarityProjectId: process.env.VITE_CLARITY_PROJECT_ID,
		},
		defaultOrganization: deployment.defaultOrganization,
	};
});

// Backwards-compatible alias.
export const getClientConfig = getPublicClientConfig;

export const getEnvValidationStateFn = createServerFn({ method: "GET" }).handler(async () => {
	const envState = getEnvValidationState();
	return {
		mode: envState.mode,
		missing: envState.missing,
		isValid: envState.isValid,
	};
});
