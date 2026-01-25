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
  WHITELABEL_BRANDING_REQUIREMENTS,
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
 * Default features for whitelabel mode
 * NOTE: Branding has NO defaults - all values must come from environment variables
 */
export const DEFAULT_WHITELABEL_FEATURES: FeaturesConfig = {
  readOnly: false,
  adminAccess: "full",
  showOptimizeButton: true,
  requiresAuth: true,
  supportsMultiOrg: true,
};

// ============================================================================
// Environment Requirements
// ============================================================================

/**
 * Get the environment variable requirements for whitelabel mode
 * Includes all branding requirements - no defaults allowed
 */
export function getEnvRequirements(): EnvRequirement[] {
  return [...COMMON_REQUIREMENTS, ...AUTH0_REQUIREMENTS, ...WHITELABEL_BRANDING_REQUIREMENTS];
}

// ============================================================================
// Helper: Create onboarding redirect URL function from template
// ============================================================================

/**
 * Create onboarding redirect URL function from template string
 * Template should contain {brandId} placeholder
 * Returns undefined if template is not provided
 */
function createOnboardingRedirectUrl(template: string | undefined): ((brandId: string) => string) | undefined {
  if (!template) return undefined;
  return (brandId: string) => template.replace("{brandId}", brandId);
}

// ============================================================================
// Client Config (Browser-Safe)
// ============================================================================

/**
 * Helper to require an env var with a helpful error message
 */
function requireValue(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Create client-safe configuration for whitelabel mode
 * All branding values are REQUIRED from environment variables - no defaults
 * 
 * NOTE: Uses NEXT_PUBLIC_ prefixed env vars because this config is used client-side.
 * Next.js only exposes env vars with this prefix to the browser bundle.
 * 
 * IMPORTANT: Environment variables MUST be accessed statically (process.env.NEXT_PUBLIC_*)
 * for Next.js to inline them at build time. Dynamic access (env[key]) doesn't work.
 */
export function createClientConfig(): ClientConfig {
  // All branding values are required - no fallbacks
  // MUST use static access for Next.js to inline these at build time
  const branding: BrandingConfig = {
    name: requireValue(process.env.NEXT_PUBLIC_APP_NAME, "NEXT_PUBLIC_APP_NAME"),
    icon: requireValue(process.env.NEXT_PUBLIC_APP_ICON, "NEXT_PUBLIC_APP_ICON"),
    url: requireValue(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL"),
    parentName: requireValue(process.env.NEXT_PUBLIC_APP_PARENT_NAME, "NEXT_PUBLIC_APP_PARENT_NAME"),
    parentUrl: requireValue(process.env.NEXT_PUBLIC_APP_PARENT_URL, "NEXT_PUBLIC_APP_PARENT_URL"),
    onboardingRedirectUrl: createOnboardingRedirectUrl(process.env.NEXT_PUBLIC_ONBOARDING_REDIRECT_URL_TEMPLATE),
    optimizationUrlTemplate: requireValue(process.env.NEXT_PUBLIC_OPTIMIZATION_URL_TEMPLATE, "NEXT_PUBLIC_OPTIMIZATION_URL_TEMPLATE"),
    chartColors: DEFAULT_CHART_COLORS,
  };

  // Analytics - plausibleDomain is optional
  const analytics: AnalyticsConfig = {
    plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
  };

  return {
    mode: MODE,
    features: DEFAULT_WHITELABEL_FEATURES,
    branding,
    analytics,
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
  const clientConfig = createClientConfig();
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
 * Generate optimization URL for a prompt using template substitution
 * This is whitelabel-specific functionality
 * 
 * Template placeholders:
 * - {brandId} - Organization/brand ID
 * - {prompt} - The prompt text (URL encoded)
 * - {webQuery} - Web query if web search enabled (URL encoded, empty string if not)
 * 
 * @param urlTemplate - URL template with placeholders
 * @param promptValue - The prompt text to include
 * @param brandId - Organization/brand ID
 * @param webSearchEnabled - Whether web search is enabled
 * @param webQuery - Web query to include if web search enabled
 */
export function generateOptimizationUrl(
  urlTemplate: string,
  promptValue: string,
  brandId: string,
  webSearchEnabled?: boolean,
  webQuery?: string,
): string {
  const encodedPrompt = encodeURIComponent(promptValue);
  const encodedBrandId = encodeURIComponent(brandId);
  const encodedWebQuery = webSearchEnabled && webQuery 
    ? encodeURIComponent(webQuery) 
    : "";

  let url = urlTemplate
    .replace("{brandId}", encodedBrandId)
    .replace("{prompt}", encodedPrompt)
    .replace("{webQuery}", encodedWebQuery);

  // Remove empty web_query parameter entirely (handles both &web_query= and ?web_query=)
  url = url.replace(/[&?]web_query=(?=&|$)/, "");
  
  // If we removed a ?web_query= and there are more params, fix the first & to ?
  url = url.replace(/\?&/, "?");

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
  /** Optional environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
}

/**
 * Create a whitelabel deployment configuration
 * @deprecated Use createClientConfig() and createServerConfig() instead
 * 
 * All branding values must be provided via environment variables - no defaults
 */
export function createWhitelabelConfig(options: WhitelabelConfigOptions): DeploymentConfig {
  const { auth0Client, managementClient, env = process.env } = options;
  
  // All branding values are required from environment - no fallbacks
  // Uses NEXT_PUBLIC_ prefix for client-side availability
  const branding: BrandingConfig = {
    name: requireEnv("NEXT_PUBLIC_APP_NAME", env),
    icon: requireEnv("NEXT_PUBLIC_APP_ICON", env),
    url: requireEnv("NEXT_PUBLIC_APP_URL", env),
    parentName: requireEnv("NEXT_PUBLIC_APP_PARENT_NAME", env),
    parentUrl: requireEnv("NEXT_PUBLIC_APP_PARENT_URL", env),
    onboardingRedirectUrl: createOnboardingRedirectUrl(env.NEXT_PUBLIC_ONBOARDING_REDIRECT_URL_TEMPLATE),
    optimizationUrlTemplate: requireEnv("NEXT_PUBLIC_OPTIMIZATION_URL_TEMPLATE", env),
    chartColors: DEFAULT_CHART_COLORS,
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
