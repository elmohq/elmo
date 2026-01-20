/**
 * @workspace/local - Local development configuration
 * 
 * This package provides the local development mode implementation:
 * - No authentication required
 * - Full read/write access
 * - Single default organization
 * - Full admin access
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
import { LocalAuthProvider } from "./auth-provider";

/**
 * Default features for local mode
 */
export const DEFAULT_LOCAL_FEATURES: FeaturesConfig = {
  readOnly: false,
  adminAccess: "full",
};

/**
 * Create a local deployment configuration
 */
export const createLocalConfig: DeploymentConfigFactory = (options = {}) => {
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
  const authProvider = new LocalAuthProvider(defaultOrganization, dependencies);
  
  return {
    mode: "local",
    features: DEFAULT_LOCAL_FEATURES,
    defaultOrganization,
    branding,
    authProvider,
  };
};

// Default export for convenience
export default createLocalConfig;
