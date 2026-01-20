/**
 * @workspace/whitelabel - White-label (Auth0) configuration
 * 
 * This package provides the whitelabel deployment mode implementation:
 * - Auth0-based authentication
 * - Full read/write access
 * - Organizations from Auth0 app_metadata
 * - Admin access from Auth0 app_metadata
 * 
 * NOTE: This package contains proprietary code and may be licensed differently.
 */

import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type {
  DeploymentConfig,
  ConfigDependencies,
  BrandingConfig,
  FeaturesConfig,
} from "@workspace/config/types";
import { Auth0AuthProvider } from "./auth-provider";

/**
 * Default branding for whitelabel mode (Whitelabel-Client)
 * TODO: handle this differently
 */
export const DEFAULT_WHITELABEL_BRANDING: BrandingConfig = {
  name: "WHITELABEL-CLIENT AI Search",
  icon: "/brands/whitelabel-client/icon.png",
  url: "https://ai.whitelabel-client.com/",
  parentName: "WHITELABEL-CLIENT",
  parentUrl: "https://app.whitelabel-client.com/",
  onboardingRedirectUrl: (brandId: string) =>
    `https://app.whitelabel-client.com/search/onboarding?org_id=${brandId}`,
  chartColors: DEFAULT_CHART_COLORS,
};

/**
 * Default features for whitelabel mode
 */
export const DEFAULT_WHITELABEL_FEATURES: FeaturesConfig = {
  readOnly: false,
  adminAccess: "full",
};

/**
 * Options for creating a whitelabel configuration
 */
export interface WhitelabelConfigOptions {
  /** Auth0 client instance */
  auth0Client: ConstructorParameters<typeof Auth0AuthProvider>[0];
  /** Auth0 Management API client instance */
  managementClient: ConstructorParameters<typeof Auth0AuthProvider>[1];
  /** Optional dependencies (redis, db, env) */
  dependencies?: ConfigDependencies;
  /** Optional branding overrides */
  branding?: Partial<BrandingConfig>;
}

/**
 * Create a whitelabel deployment configuration
 * 
 * Unlike local/demo, this requires Auth0 clients to be passed in
 */
export function createWhitelabelConfig(options: WhitelabelConfigOptions): DeploymentConfig {
  const { auth0Client, managementClient, dependencies = {}, branding: brandingOverrides = {} } = options;
  
  // Read from environment if available
  const env = dependencies.env ?? process.env;
  
  // Determine branding (whitelabel uses its own defaults if env vars not set)
  const branding: BrandingConfig = {
    name: env.APP_NAME ?? brandingOverrides.name ?? DEFAULT_WHITELABEL_BRANDING.name,
    icon: env.APP_ICON ?? brandingOverrides.icon ?? DEFAULT_WHITELABEL_BRANDING.icon,
    url: env.APP_URL ?? brandingOverrides.url ?? DEFAULT_WHITELABEL_BRANDING.url,
    parentName: env.APP_PARENT_NAME ?? brandingOverrides.parentName ?? DEFAULT_WHITELABEL_BRANDING.parentName,
    parentUrl: env.APP_PARENT_URL ?? brandingOverrides.parentUrl ?? DEFAULT_WHITELABEL_BRANDING.parentUrl,
    onboardingRedirectUrl: brandingOverrides.onboardingRedirectUrl ?? DEFAULT_WHITELABEL_BRANDING.onboardingRedirectUrl,
    chartColors: brandingOverrides.chartColors ?? DEFAULT_WHITELABEL_BRANDING.chartColors,
  };
  
  // Create auth provider
  const authProvider = new Auth0AuthProvider(auth0Client, managementClient, dependencies);
  
  return {
    mode: "whitelabel",
    features: DEFAULT_WHITELABEL_FEATURES,
    branding,
    authProvider,
  };
}

// Default export for convenience
export default createWhitelabelConfig;
