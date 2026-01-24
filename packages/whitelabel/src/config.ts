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
import {
  COMMON_REQUIREMENTS,
  AUTH0_REQUIREMENTS,
  getEnv,
  requireEnv,
} from "@workspace/config/env";
import type {
  DeploymentConfig,
  BrandingConfig,
  FeaturesConfig,
  ClientConfig,
  ServerConfig,
  EnvRequirement,
  AnalyticsConfig,
  DeploymentPackage,
} from "@workspace/config/types";
import { Auth0AuthProvider, type Auth0AppMetadata, type Auth0SessionWithMetadata } from "./auth-provider";

// ============================================================================
// Constants
// ============================================================================

/**
 * The deployment mode for this package
 */
export const MODE = "whitelabel" as const;

/**
 * Default branding for whitelabel mode (Whitelabel-Client)
 */
export const DEFAULT_WHITELABEL_BRANDING: BrandingConfig = {
  name: "WHITELABEL-CLIENT AI Search",
  icon: "/brands/whitelabel-client/icon.png",
  url: "https://ai.whitelabel-client.com/",
  parentName: "WHITELABEL-CLIENT",
  parentUrl: "https://app.whitelabel-client.com/",
  onboardingRedirectUrl: (brandId: string) =>
    `https://app.whitelabel-client.com/search/onboarding?org_id=${brandId}`,
  optimizationBaseUrl: "https://app.whitelabel-client.com/search/create-aeo-funnel",
  chartColors: DEFAULT_CHART_COLORS,
};

/**
 * Default features for whitelabel mode
 */
export const DEFAULT_WHITELABEL_FEATURES: FeaturesConfig = {
  readOnly: false,
  adminAccess: "full",
  showOptimizeButton: true,
  requiresAuth: true,
  supportsMultiOrg: true,
};

/**
 * Default analytics config for whitelabel mode
 */
export const DEFAULT_WHITELABEL_ANALYTICS: AnalyticsConfig = {
  plausibleDomain: "aeo.whitelabel-client.com",
  // Clarity is enabled conditionally based on VERCEL_ENV
};

// ============================================================================
// Environment Requirements
// ============================================================================

/**
 * Get the environment variable requirements for whitelabel mode
 */
export function getEnvRequirements(): EnvRequirement[] {
  return [...COMMON_REQUIREMENTS, ...AUTH0_REQUIREMENTS];
}

// ============================================================================
// Client Config (Browser-Safe)
// ============================================================================

/**
 * Create client-safe configuration for whitelabel mode
 */
export function createClientConfig(
  env: Record<string, string | undefined> = process.env
): ClientConfig {
  const branding: BrandingConfig = {
    name: getEnv("APP_NAME", DEFAULT_WHITELABEL_BRANDING.name, env),
    icon: getEnv("APP_ICON", DEFAULT_WHITELABEL_BRANDING.icon, env),
    url: getEnv("APP_URL", DEFAULT_WHITELABEL_BRANDING.url, env),
    parentName: env.APP_PARENT_NAME ?? DEFAULT_WHITELABEL_BRANDING.parentName,
    parentUrl: env.APP_PARENT_URL ?? DEFAULT_WHITELABEL_BRANDING.parentUrl,
    onboardingRedirectUrl: DEFAULT_WHITELABEL_BRANDING.onboardingRedirectUrl,
    optimizationBaseUrl: env.OPTIMIZATION_BASE_URL ?? DEFAULT_WHITELABEL_BRANDING.optimizationBaseUrl,
    chartColors: DEFAULT_CHART_COLORS,
  };

  return {
    mode: MODE,
    features: DEFAULT_WHITELABEL_FEATURES,
    branding,
    analytics: DEFAULT_WHITELABEL_ANALYTICS,
    // No defaultOrganization in whitelabel mode - uses multi-org from Auth0
  };
}

// ============================================================================
// Server Config
// ============================================================================

// Cache for Auth0 clients (created lazily)
let cachedAuth0Client: ReturnType<typeof createAuth0Client> | null = null;
let cachedManagementClient: ReturnType<typeof createManagementClient> | null = null;
let cachedAuthProvider: Auth0AuthProvider | null = null;

/**
 * Create Auth0 client for session management
 * This is created lazily to avoid issues with missing env vars at import time
 */
function createAuth0Client() {
  // Dynamic import to avoid bundling Auth0 in client builds
  const { Auth0Client } = require("@auth0/nextjs-auth0/server");
  return new Auth0Client();
}

/**
 * Create Auth0 Management API client
 * This is created lazily to avoid issues with missing env vars at import time
 */
function createManagementClient(env: Record<string, string | undefined> = process.env) {
  // Dynamic import to avoid bundling Auth0 in client builds
  const { ManagementClient } = require("auth0");
  return new ManagementClient({
    domain: requireEnv("AUTH0_MGMT_API_DOMAIN", env),
    clientId: requireEnv("AUTH0_CLIENT_ID", env),
    clientSecret: requireEnv("AUTH0_CLIENT_SECRET", env),
  });
}

/**
 * Get or create the Auth0 client (singleton)
 */
function getAuth0Client() {
  if (!cachedAuth0Client) {
    cachedAuth0Client = createAuth0Client();
  }
  return cachedAuth0Client;
}

/**
 * Get or create the Management client (singleton)
 */
function getManagementClient(env: Record<string, string | undefined> = process.env) {
  if (!cachedManagementClient) {
    cachedManagementClient = createManagementClient(env);
  }
  return cachedManagementClient;
}

/**
 * Get or create the Auth0 auth provider (singleton)
 */
function getAuthProvider(env: Record<string, string | undefined> = process.env) {
  if (!cachedAuthProvider) {
    cachedAuthProvider = new Auth0AuthProvider(
      getAuth0Client(),
      getManagementClient(env)
    );
  }
  return cachedAuthProvider;
}

/**
 * Create proxy auth handler for whitelabel mode
 * Handles Auth0 session-based authentication
 */
function createProxyAuthHandler(env: Record<string, string | undefined> = process.env) {
  const auth0Client = getAuth0Client();
  const authProvider = getAuthProvider(env);
  const managementClient = getManagementClient(env);
  
  // Import NextResponse dynamically
  const { NextResponse } = require("next/server");
  
  return async (request: unknown, pathname: string): Promise<Response> => {
    const session = await auth0Client.getSession(request) as Auth0SessionWithMetadata | null;
    
    if (!session) {
      // No session - handle based on path
      if (pathname.startsWith("/auth")) {
        // Auth routes are handled by Auth0
        return auth0Client.middleware(request);
      } else if (pathname.startsWith("/api")) {
        // API routes require authentication
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      } else {
        // Other routes redirect to home
        const req = request as { url: string };
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    
    // Has session - check if app metadata needs refreshing (~every 15 min)
    // Use probabilistic refresh (25% chance) to avoid thundering herd on stale sessions
    if (session.user?.sub && authProvider.needsMetadataRefresh(session) && Math.random() < 0.25) {
      const now = Math.floor(Date.now() / 1000);
      const age = session.elmoAppMetadataFetchedAt 
        ? now - session.elmoAppMetadataFetchedAt 
        : "never";
      console.log(`[handleProxyAuth] Refreshing metadata - age: ${age}s, path: ${pathname}`);
      
      // Fetch metadata directly from Management API
      let appMetadata: Auth0AppMetadata = {};
      
      try {
        const userData = await managementClient.users.get({
          id: session.user.sub,
          fields: "app_metadata",
        });
        const rawMetadata = userData.data?.app_metadata as Record<string, unknown> | undefined;
        if (rawMetadata) {
          appMetadata = {
            elmo_orgs: rawMetadata.elmo_orgs as Auth0AppMetadata["elmo_orgs"],
            elmo_admin: rawMetadata.elmo_admin as Auth0AppMetadata["elmo_admin"],
            elmo_report_generator_access: rawMetadata.elmo_report_generator_access as Auth0AppMetadata["elmo_report_generator_access"],
          };
        }
      } catch (error) {
        console.error("[handleProxyAuth] Error fetching metadata:", error);
        // On error, preserve existing metadata and continue
        appMetadata = session.elmoAppMetadata || {};
      }
      
      // Create the middleware response first
      const response = await auth0Client.middleware(request);
      
      // Update session with new metadata
      try {
        await auth0Client.updateSession(request, response, {
          ...session,
          elmoAppMetadata: appMetadata,
          elmoAppMetadataFetchedAt: now,
        });
      } catch (error) {
        console.error("[handleProxyAuth] Failed to update session:", error);
      }
      
      return response;
    }
    
    // Session metadata is fresh - proceed normally
    return auth0Client.middleware(request);
  };
}

/**
 * Create server-side configuration for whitelabel mode
 */
export function createServerConfig(
  env: Record<string, string | undefined> = process.env
): ServerConfig {
  const clientConfig = createClientConfig(env);
  const authProvider = getAuthProvider(env);

  return {
    mode: MODE,
    features: clientConfig.features,
    branding: clientConfig.branding,
    authProvider,
    handleProxyAuth: createProxyAuthHandler(env),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate optimization URL for a prompt
 * This is whitelabel-specific functionality
 */
export function generateOptimizationUrl(
  promptValue: string,
  orgId: string,
  webSearchEnabled?: boolean,
  oldestWebQuery?: string,
  baseUrl: string = DEFAULT_WHITELABEL_BRANDING.optimizationBaseUrl!
): string {
  // URL encode the prompt value
  const encodedPrompt = encodeURIComponent(promptValue);
  const encodedOrgId = encodeURIComponent(orgId);

  // Build the URL with prompt and org_id
  let url = `${baseUrl}?prompt=${encodedPrompt}&org_id=${encodedOrgId}`;

  // Add web_query parameter if web search is enabled and web query is present
  if (webSearchEnabled && oldestWebQuery) {
    const encodedWebQuery = encodeURIComponent(oldestWebQuery);
    url += `&web_query=${encodedWebQuery}`;
  }

  return url;
}

// ============================================================================
// Legacy API (backwards compatibility)
// ============================================================================

/**
 * Options for creating a whitelabel configuration (legacy API)
 */
export interface WhitelabelConfigOptions {
  /** Auth0 client instance */
  auth0Client: ConstructorParameters<typeof Auth0AuthProvider>[0];
  /** Auth0 Management API client instance */
  managementClient: ConstructorParameters<typeof Auth0AuthProvider>[1];
  /** Optional branding overrides */
  branding?: Partial<BrandingConfig>;
  /** Optional environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
}

/**
 * Create a whitelabel deployment configuration
 * @deprecated Use createClientConfig() and createServerConfig() instead
 * 
 * Unlike local/demo, this requires Auth0 clients to be passed in
 */
export function createWhitelabelConfig(options: WhitelabelConfigOptions): DeploymentConfig {
  const { auth0Client, managementClient, branding: brandingOverrides = {}, env = process.env } = options;
  
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
  
  // Create auth provider with provided clients
  const authProvider = new Auth0AuthProvider(auth0Client, managementClient);
  
  return {
    mode: MODE,
    features: DEFAULT_WHITELABEL_FEATURES,
    branding,
    authProvider,
  };
}

// ============================================================================
// Package Export
// ============================================================================

/**
 * The deployment package implementation for whitelabel mode
 */
export const deploymentPackage: DeploymentPackage = {
  mode: MODE,
  createClientConfig,
  createServerConfig,
  getEnvRequirements,
};

// Default export for convenience
export default createWhitelabelConfig;
