/**
 * Server functions for providing deployment configuration to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDeployment } from "@/lib/config/server";
import type { ClientConfig } from "@workspace/config/types";
import { getEnvValidationState } from "@workspace/config/env";

export type PublicClientConfig = Omit<ClientConfig, "branding"> & {
	branding: Omit<ClientConfig["branding"], "onboardingRedirectUrl">;
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
const POSTHOG_PUBLIC_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";

function resolvePosthogKey(): string | undefined {
	if (process.env.DISABLE_TELEMETRY) return undefined;
	return process.env.VITE_POSTHOG_KEY ?? POSTHOG_PUBLIC_KEY;
}

export const getClientConfig = createServerFn({ method: "GET" }).handler(async (): Promise<PublicClientConfig> => {
	const deployment = getDeployment();

	const { onboardingRedirectUrl, ...serializableBranding } = deployment.branding;

	return {
		mode: deployment.mode,
		features: deployment.features,
		branding: serializableBranding,
		analytics: {
			plausibleDomain: process.env.VITE_PLAUSIBLE_DOMAIN,
			clarityProjectId: process.env.VITE_CLARITY_PROJECT_ID,
			posthogKey: resolvePosthogKey(),
		},
		defaultOrganization: deployment.defaultOrganization,
	};
});

export const getEnvValidationStateFn = createServerFn({ method: "GET" }).handler(async () => {
	const envState = getEnvValidationState();
	return {
		mode: envState.mode,
		missing: envState.missing,
		isValid: envState.isValid,
	};
});
