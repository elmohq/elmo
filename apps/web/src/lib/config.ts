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
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { ManagementClient } from "auth0";
import { redis } from "./redis";

// Track if we've started initialization (to prevent recursion)
let initializing = false;

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
 * Create Redis dependency wrapper
 */
function createRedisDependency() {
  return {
    get: async <T>(key: string): Promise<T | null> => {
      const value = await redis.get(key);
      return value as T | null;
    },
    setex: async (key: string, seconds: number, value: string): Promise<void> => {
      await redis.setex(key, seconds, value);
    },
    del: async (key: string): Promise<void> => {
      await redis.del(key);
    },
  };
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
        config = createLocalConfig({
          dependencies: {
            redis: createRedisDependency(),
          },
        });
        break;

      case "demo":
        config = createDemoConfig({
          dependencies: {
            redis: createRedisDependency(),
          },
        });
        break;

      case "whitelabel":
      default: {
        const auth0Client = new Auth0Client();
        const managementClient = new ManagementClient({
          domain: process.env.AUTH0_MGMT_API_DOMAIN!,
          clientId: process.env.AUTH0_CLIENT_ID!,
          clientSecret: process.env.AUTH0_CLIENT_SECRET!,
        });

        config = createWhitelabelConfig({
          auth0Client,
          // Cast to the minimal interface expected by Auth0AuthProvider
          // The actual ManagementClient is compatible at runtime
          managementClient: managementClient as Parameters<typeof createWhitelabelConfig>[0]["managementClient"],
          dependencies: {
            redis: createRedisDependency(),
          },
        });
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
 * Get the Auth0 client (only available in whitelabel mode)
 * Returns null in local/demo modes
 */
export function getAuth0Client(): Auth0AuthProvider["auth0Client"] | null {
  ensureInitialized();
  const config = getConfig();
  
  if (config.mode === "whitelabel") {
    const provider = config.authProvider as Auth0AuthProvider;
    return provider.getAuth0Client();
  }
  
  return null;
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

/**
 * Clear the auth cache
 */
export async function clearAuthCache(): Promise<void> {
  return getAuthProvider().clearCache();
}

// Export types
export type { DeploymentConfig, DeploymentMode, Session, Organization, BrandingConfig, FeaturesConfig, AuthProvider } from "@workspace/config/types";
