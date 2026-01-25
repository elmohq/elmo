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
import {
  COMMON_REQUIREMENTS,
  LOCAL_DEMO_REQUIREMENTS,
  requireEnv,
  getEnv,
} from "@workspace/config/env";
import type {
  DeploymentConfig,
  DeploymentConfigFactory,
  ConfigDependencies,
  BrandingConfig,
  DefaultOrganization,
  FeaturesConfig,
  ClientConfig,
  ServerConfig,
  EnvRequirement,
  AnalyticsConfig,
  DeploymentPackage,
} from "@workspace/config/types";
import { NextResponse } from "next/server";
import { DemoAuthProvider } from "./auth-provider";

// ============================================================================
// Constants
// ============================================================================

/**
 * The deployment mode for this package
 */
export const MODE = "demo" as const;

/**
 * Default features for demo mode
 */
export const DEFAULT_DEMO_FEATURES: FeaturesConfig = {
  readOnly: true,
  adminAccess: "readonly", // Can view admin pages but writes blocked
  showOptimizeButton: false, // No parent app to optimize with
  requiresAuth: false,
  supportsMultiOrg: false,
};

/**
 * Default analytics config for demo mode (no analytics)
 */
export const DEFAULT_DEMO_ANALYTICS: AnalyticsConfig = {
  // No analytics in demo mode
};

// ============================================================================
// Environment Requirements
// ============================================================================

/**
 * Get the environment variable requirements for demo mode
 */
export function getEnvRequirements(): EnvRequirement[] {
  return [...COMMON_REQUIREMENTS, ...LOCAL_DEMO_REQUIREMENTS];
}

// ============================================================================
// Client Config (Browser-Safe)
// ============================================================================

/**
 * Create client-safe configuration for demo mode
 */
export function createClientConfig(
  env: Record<string, string | undefined> = process.env
): ClientConfig {
  const branding: BrandingConfig = {
    name: getEnv("APP_NAME", DEFAULT_APP_NAME, env),
    icon: getEnv("APP_ICON", DEFAULT_APP_ICON, env),
    url: getEnv("APP_URL", DEFAULT_APP_URL, env),
    parentName: env.APP_PARENT_NAME,
    parentUrl: env.APP_PARENT_URL,
    chartColors: DEFAULT_CHART_COLORS,
  };

  const defaultOrganization: DefaultOrganization = {
    id: requireEnv("DEFAULT_ORG_ID", env),
    name: requireEnv("DEFAULT_ORG_NAME", env),
  };

  return {
    mode: MODE,
    features: DEFAULT_DEMO_FEATURES,
    branding,
    analytics: DEFAULT_DEMO_ANALYTICS,
    defaultOrganization,
  };
}

// ============================================================================
// Server Config
// ============================================================================

/**
 * Create server-side configuration for demo mode
 */
export function createServerConfig(
  env: Record<string, string | undefined> = process.env
): ServerConfig {
  const clientConfig = createClientConfig(env);
  
  // Create auth provider
  const authProvider = new DemoAuthProvider(clientConfig.defaultOrganization);

  return {
    mode: MODE,
    features: clientConfig.features,
    branding: clientConfig.branding,
    defaultOrganization: clientConfig.defaultOrganization,
    authProvider,
    handleProxyAuth: async () => {
      // Demo mode: no auth required, always allow
      return NextResponse.next();
    },
  };
}

// ============================================================================
// Legacy API (backwards compatibility)
// ============================================================================

/**
 * Create a demo deployment configuration
 * @deprecated Use createClientConfig() and createServerConfig() instead
 */
export const createDemoConfig: DeploymentConfigFactory = (options = {}) => {
  const { dependencies = {}, overrides = {} } = options;
  
  // Read from environment if available
  const env =
    dependencies.env ??
    ((globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ??
      {});
  
  // Determine default organization
  const defaultOrganization: DefaultOrganization = overrides.defaultOrganization ?? {
    id: requireEnv("DEFAULT_ORG_ID", env),
    name: requireEnv("DEFAULT_ORG_NAME", env),
  };
  
  // Determine branding (uses defaults if env vars not set)
  const branding: BrandingConfig = {
    name: overrides.branding?.name ?? getEnv("APP_NAME", DEFAULT_APP_NAME, env),
    icon: overrides.branding?.icon ?? getEnv("APP_ICON", DEFAULT_APP_ICON, env),
    url: overrides.branding?.url ?? getEnv("APP_URL", DEFAULT_APP_URL, env),
    parentName: overrides.branding?.parentName ?? env.APP_PARENT_NAME,
    parentUrl: overrides.branding?.parentUrl ?? env.APP_PARENT_URL,
    onboardingRedirectUrl: overrides.branding?.onboardingRedirectUrl,
    optimizationUrlTemplate: overrides.branding?.optimizationUrlTemplate,
    chartColors: overrides.branding?.chartColors ?? DEFAULT_CHART_COLORS,
  };
  
  // Create auth provider
  const authProvider = new DemoAuthProvider(defaultOrganization, dependencies);
  
  return {
    mode: MODE,
    features: DEFAULT_DEMO_FEATURES,
    defaultOrganization,
    branding,
    authProvider,
  };
};

// ============================================================================
// Package Export
// ============================================================================

/**
 * The deployment package implementation for demo mode
 */
export const deploymentPackage: DeploymentPackage = {
  mode: MODE,
  createClientConfig,
  createServerConfig,
  getEnvRequirements,
};

// Default export for convenience
export default createDemoConfig;
