/**
 * @workspace/demo - Demo mode configuration
 * 
 * This package provides the demo mode implementation:
 * - No authentication required
 * - Read-only access (all writes blocked)
 * - Single default organization
 * - Read-only admin access (can view admin pages but not modify)
 * 
 * Extends @workspace/local with read-only restrictions
 */

import {
  DEFAULT_CHART_COLORS,
  DEFAULT_APP_NAME,
  DEFAULT_APP_ICON,
  DEFAULT_APP_URL,
} from "@workspace/config/constants";
import type {
  DeploymentConfig,
  DeploymentConfigFactory,
  ConfigDependencies,
  BrandingConfig,
  DefaultOrganization,
  FeaturesConfig,
} from "@workspace/config/types";
import { DemoAuthProvider } from "./auth-provider";

/**
 * Default features for demo mode
 */
export const DEFAULT_DEMO_FEATURES: FeaturesConfig = {
  readOnly: true,
  adminAccess: "readonly",  // Can view admin pages but writes blocked
};

/**
 * Create a demo deployment configuration
 */
export const createDemoConfig: DeploymentConfigFactory = (options = {}) => {
  const { dependencies = {}, overrides = {} } = options;
  
  // Read from environment if available
  const env =
    dependencies.env ??
    ((globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ??
      {});
  const requireEnv = (key: string): string => {
    const value = env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };
  
  // Determine default organization
  const defaultOrganization: DefaultOrganization = overrides.defaultOrganization ?? {
    id: requireEnv("DEFAULT_ORG_ID"),
    name: requireEnv("DEFAULT_ORG_NAME"),
  };
  
  // Determine branding (uses defaults if env vars not set)
  const branding: BrandingConfig = {
    name: overrides.branding?.name ?? env.APP_NAME ?? DEFAULT_APP_NAME,
    icon: overrides.branding?.icon ?? env.APP_ICON ?? DEFAULT_APP_ICON,
    url: overrides.branding?.url ?? env.APP_URL ?? DEFAULT_APP_URL,
    parentName: overrides.branding?.parentName ?? env.APP_PARENT_NAME,
    parentUrl: overrides.branding?.parentUrl ?? env.APP_PARENT_URL,
    onboardingRedirectUrl: overrides.branding?.onboardingRedirectUrl,
    chartColors: overrides.branding?.chartColors ?? DEFAULT_CHART_COLORS,
  };
  
  // Create auth provider
  const authProvider = new DemoAuthProvider(defaultOrganization, dependencies);
  
  return {
    mode: "demo",
    features: DEFAULT_DEMO_FEATURES,
    defaultOrganization,
    branding,
    authProvider,
  };
};

// Default export for convenience
export default createDemoConfig;
