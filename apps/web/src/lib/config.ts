/**
 * Deployment configuration initialization
 * 
 * This file initializes the deployment configuration based on DEPLOYMENT_MODE
 * and provides access to the configured deployment.
 */

import { initializeConfig, getConfig as getCoreConfig, isConfigInitialized } from "@workspace/config/runtime";
import type { DeploymentConfig } from "@workspace/config/types";
import { createLocalConfig } from "@workspace/local/config";
import { createDemoConfig } from "@workspace/demo/config";
import { createWhitelabelConfig } from "@workspace/whitelabel/config";
import { Auth0AuthProvider } from "@workspace/whitelabel/auth-provider";
import type { Auth0AppMetadata, Auth0SessionWithMetadata } from "@workspace/whitelabel/auth-provider";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { ManagementClient } from "auth0";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Track if we've started initialization (to prevent recursion)
let initializing = false;

// Store Auth0 client reference for proxy auth handling (whitelabel mode only)
let auth0ClientInstance: ReturnType<Auth0AuthProvider["getAuth0Client"]> | null = null;
let auth0ProviderInstance: Auth0AuthProvider | null = null;
let managementClientInstance: ManagementClient | null = null;

/**
 * Get the deployment mode from environment
 */
function getDeploymentMode(): "whitelabel" | "local" | "demo" {
  const mode = process.env.DEPLOYMENT_MODE?.toLowerCase();
  if (mode === "local" || mode === "demo") {
    return mode;
  }
  // Default to whitelabel for backwards compatibility
  return "whitelabel";
}

/**
 * Initialize the deployment configuration
 * 
 * This is called lazily on first access to ensure proper initialization
 */
function ensureInitialized(): void {
  if (isConfigInitialized()) {
    return;
  }
  
  // Prevent recursive initialization
  if (initializing) {
    return;
  }
  initializing = true;

  try {
    const mode = getDeploymentMode();
    let config: DeploymentConfig;

    switch (mode) {
      case "local":
        config = createLocalConfig();
        break;

      case "demo":
        config = createDemoConfig();
        break;

      case "whitelabel":
      default: {
        // Create ManagementClient first so it can be used in beforeSessionSaved
        const managementClient = new ManagementClient({
          domain: process.env.AUTH0_MGMT_API_DOMAIN!,
          clientId: process.env.AUTH0_CLIENT_ID!,
          clientSecret: process.env.AUTH0_CLIENT_SECRET!,
        });

        // Create Auth0Client
        // Note: Metadata management is handled entirely in handleProxyAuth,
        // which runs on every request and refreshes when stale.
        const auth0Client = new Auth0Client();

        config = createWhitelabelConfig({
          auth0Client,
          // Cast to the minimal interface expected by Auth0AuthProvider
          // The actual ManagementClient is compatible at runtime
          managementClient: managementClient as Parameters<typeof createWhitelabelConfig>[0]["managementClient"],
        });
        
        // Store references for proxy auth handling
        auth0ClientInstance = auth0Client;
        auth0ProviderInstance = config.authProvider as Auth0AuthProvider;
        managementClientInstance = managementClient;
        break;
      }
    }

    initializeConfig(config);
  } finally {
    initializing = false;
  }
}

/**
 * Get the current deployment configuration
 * Auto-initializes if not yet initialized
 */
export function getDeploymentConfig(): DeploymentConfig {
  ensureInitialized();
  return getCoreConfig();
}

/**
 * Wrapper around core getConfig that ensures initialization
 */
export function getConfig(): DeploymentConfig {
  ensureInitialized();
  return getCoreConfig();
}

/**
 * Handle proxy authentication for the current deployment mode
 * 
 * This abstracts auth handling so the proxy doesn't need to know about
 * specific auth implementations (Auth0, etc.)
 * 
 * @param request - The incoming request
 * @param pathname - The request pathname
 * @returns Response to return, or null to continue with NextResponse.next()
 */
export async function handleProxyAuth(
  request: NextRequest,
  pathname: string
): Promise<Response> {
  ensureInitialized();
  const config = getConfig();
  
  // Local/demo modes: no session-based auth, allow all requests
  if (config.mode === "local" || config.mode === "demo") {
    return NextResponse.next();
  }
  
  // Whitelabel mode: handle Auth0 session-based authentication
  if (config.mode === "whitelabel") {
    if (!auth0ClientInstance || !auth0ProviderInstance) {
      console.error("Auth0 client not available in whitelabel mode");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    
    const session = await auth0ClientInstance.getSession(request) as Auth0SessionWithMetadata | null;
    
    if (!session) {
      // No session - handle based on path
      if (pathname.startsWith("/auth")) {
        // Auth routes are handled by Auth0
        return auth0ClientInstance.middleware(request);
      } else if (pathname.startsWith("/api")) {
        // API routes require authentication
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      } else {
        // Other routes redirect to home
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    
    // Has session - check if app metadata needs refreshing (~every 15 min)
    // Use probabilistic refresh (25% chance) to avoid thundering herd on stale sessions
    if (session.user?.sub && auth0ProviderInstance.needsMetadataRefresh(session) && Math.random() < 0.25) {
      const now = Math.floor(Date.now() / 1000);
      const age = session.elmoAppMetadataFetchedAt 
        ? now - session.elmoAppMetadataFetchedAt 
        : "never";
      console.log(`[handleProxyAuth] Refreshing metadata - age: ${age}s, path: ${pathname}`);
      
      // Fetch metadata directly from Management API
      let appMetadata: Auth0AppMetadata = {};
      
      try {
        if (managementClientInstance) {
          const userData = await managementClientInstance.users.get({
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
        }
      } catch (error) {
        console.error("[handleProxyAuth] Error fetching metadata:", error);
        // On error, preserve existing metadata and continue
        appMetadata = session.elmoAppMetadata || {};
      }
      
      // Create the middleware response first
      const response = await auth0ClientInstance.middleware(request);
      
      // Update session with new metadata
      try {
        await auth0ClientInstance.updateSession(request, response, {
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
    return auth0ClientInstance.middleware(request);
  }

  // Block access by default if we reach this - config is not valid
  return NextResponse.json(
    {
      error: "Configuration Error",
      message: "Deployment configuration could not be initialized. Access denied.",
    },
    { status: 503 }
  );
}

// ============================================================================
// Convenience functions (wrappers that ensure initialization)
// ============================================================================

import type { BrandingConfig, FeaturesConfig, AuthProvider, Organization, Session } from "@workspace/config/types";

/**
 * Get the branding configuration
 */
export function getBranding(): BrandingConfig {
  ensureInitialized();
  return getCoreConfig().branding;
}

/**
 * Get the features configuration
 */
export function getFeatures(): FeaturesConfig {
  ensureInitialized();
  return getCoreConfig().features;
}

/**
 * Check if the current deployment is in read-only mode
 */
export function isReadOnly(): boolean {
  ensureInitialized();
  return getCoreConfig().features.readOnly;
}

/**
 * Check if admin access is enabled and at what level
 */
export function getAdminAccess(): false | "full" | "readonly" {
  ensureInitialized();
  return getCoreConfig().features.adminAccess;
}

/**
 * Check if admin panel is accessible (either full or readonly)
 */
export function isAdminAccessible(): boolean {
  const access = getAdminAccess();
  return access === "full" || access === "readonly";
}

/**
 * Check if admin has full write access
 */
export function hasFullAdminAccess(): boolean {
  return getAdminAccess() === "full";
}

/**
 * Get the auth provider
 */
export function getAuthProvider(): AuthProvider {
  ensureInitialized();
  return getCoreConfig().authProvider;
}

/**
 * Get the current user session
 */
export async function getSession(): Promise<Session | null> {
  return getAuthProvider().getSession();
}

/**
 * Get organizations the current user has access to
 */
export async function getOrganizations(): Promise<Organization[]> {
  return getAuthProvider().organizations.list();
}

/**
 * Check if user has access to a specific organization
 */
export async function hasOrgAccess(orgId: string): Promise<boolean> {
  return getAuthProvider().organizations.hasAccess(orgId);
}

/**
 * Check if user can create organizations
 */
export function canCreateOrganization(): boolean {
  return getAuthProvider().organizations.canCreate();
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  return getAuthProvider().isAdmin();
}

/**
 * Check if the current user has report generator access
 */
export async function hasReportGeneratorAccess(): Promise<boolean> {
  return getAuthProvider().hasReportGeneratorAccess();
}

// Export types
export type { DeploymentConfig, DeploymentMode, Session, Organization, BrandingConfig, FeaturesConfig, AuthProvider } from "@workspace/config/types";
