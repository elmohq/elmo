/**
 * Test mock helpers for deployment configuration.
 *
 * Provides factory functions to create mock Deployments for each deployment
 * mode, making it easy to write tests against different feature flag scenarios.
 *
 * Auth checks (admin, org access, etc.) are handled by better-auth and are
 * tested via the auth helpers, not through the Deployment interface.
 */
import type { Deployment, FeaturesConfig } from "@workspace/config/types";
import { FEATURES_BY_MODE } from "@workspace/deployment";

// ============================================================================
// Feature flag presets
// ============================================================================

export const LOCAL_FEATURES: FeaturesConfig = FEATURES_BY_MODE.local;
export const DEMO_FEATURES: FeaturesConfig = FEATURES_BY_MODE.demo;
export const WHITELABEL_FEATURES: FeaturesConfig = FEATURES_BY_MODE.whitelabel;
export const CLOUD_FEATURES: FeaturesConfig = FEATURES_BY_MODE.cloud;

// ============================================================================
// Mock Deployment
// ============================================================================

export type DeploymentMode = "local" | "demo" | "whitelabel" | "cloud";

export interface MockDeploymentOptions {
	featureOverrides?: Partial<FeaturesConfig>;
}

export function createMockDeployment(mode: DeploymentMode, options: MockDeploymentOptions = {}): Deployment {
	return {
		mode,
		features: { ...FEATURES_BY_MODE[mode], ...options.featureOverrides },
		branding: {
			name: "Test App",
			icon: "/icon.svg",
			url: "http://localhost:3000",
			chartColors: ["#3b82f6", "#10b981", "#f59e0b"],
		},
	};
}
