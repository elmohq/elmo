/**
 * Elmo Cloud deployment factory.
 *
 * Creates the Deployment for the managed multi-tenant Elmo Cloud offering.
 *
 * Feature flags: self-serve signup ON, multi-org ON, Stripe billing ON,
 * read-only OFF. Report generation is OFF — the one-time report generator is
 * an internal/whitelabel tool and is disabled entirely in cloud (no worker
 * scheduling, no UI entry points).
 *
 * Branding uses the Elmo defaults, so no VITE_APP_* overrides are needed. Only
 * the public app URL is deployment-specific and is read from APP_URL (required
 * for cloud via env validation; the localhost default keeps this factory total
 * so a missing APP_URL surfaces on the env-validation page rather than throwing).
 */
import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL, DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { getEnv } from "@workspace/config/env";
import type { Deployment } from "@workspace/config/types";

export function createCloudDeployment(env: Record<string, string | undefined> = process.env): Deployment {
	return {
		mode: "cloud",
		features: {
			readOnly: false,
			showOptimizeButton: false,
			supportsMultiOrg: true,
			canCreateBrands: true,
			selfServeSignup: true,
			billing: true,
			reportGeneration: false,
		},
		branding: {
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: getEnv("APP_URL", DEFAULT_APP_URL, env),
			chartColors: DEFAULT_CHART_COLORS,
		},
	};
}
