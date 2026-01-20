/**
 * Client-safe deployment configuration
 * 
 * This file provides configuration that can be safely used on both client and server.
 * It does NOT include auth providers or server-side dependencies.
 * 
 * Use this for:
 * - React components
 * - Client-side hooks
 * - Branding/UI configuration
 * 
 * For server-side auth operations, use config.server.ts instead.
 */

import { DEFAULT_CHART_COLORS, DEFAULT_APP_NAME, DEFAULT_APP_ICON, DEFAULT_APP_URL } from "@workspace/config/constants";
import type { BrandingConfig, FeaturesConfig, DeploymentMode } from "@workspace/config/types";

// Whitelabel-specific defaults (whitelabel-client branding)
const WHITELABEL_APP_NAME = "WHITELABEL-CLIENT AI Search";
const WHITELABEL_APP_ICON = "/brands/whitelabel-client/icon.png";
const WHITELABEL_APP_URL = "https://ai.whitelabel-client.com/";
const WHITELABEL_PARENT_NAME = "WHITELABEL-CLIENT";
const WHITELABEL_PARENT_URL = "https://app.whitelabel-client.com/";

// ============================================================================
// Client-safe configuration (no server dependencies)
// ============================================================================

/**
 * Get the deployment mode from environment
 * Works on both client and server
 */
export function getDeploymentMode(): DeploymentMode {
  // Check NEXT_PUBLIC_ first (available on client), then server-side env
  const mode = (
    typeof window !== "undefined" 
      ? process.env.NEXT_PUBLIC_DEPLOYMENT_MODE 
      : process.env.DEPLOYMENT_MODE
  )?.toLowerCase();
  
  if (mode === "local" || mode === "demo" || mode === "cloud") {
    return mode;
  }
  // Default to whitelabel for backwards compatibility
  return "whitelabel";
}

/**
 * Check if running on the client side
 */
export function isClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * Check if running on the server side
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}

// ============================================================================
// Branding Configuration (client-safe)
// ============================================================================

/**
 * Get branding configuration from environment variables
 * All values have sensible defaults
 */
export function getBranding(): BrandingConfig {
  const mode = getDeploymentMode();

  const getEnv = (key: string, publicKey: string): string | undefined => {
    if (typeof window !== "undefined") {
      return process.env[publicKey];
    }
    return process.env[key] || process.env[publicKey];
  };

  const requireEnv = (key: string, publicKey: string): string => {
    const value = getEnv(key, publicKey);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  // Use mode-specific defaults for branding
  const defaultName = mode === "whitelabel" ? WHITELABEL_APP_NAME : DEFAULT_APP_NAME;
  const defaultIcon = mode === "whitelabel" ? WHITELABEL_APP_ICON : DEFAULT_APP_ICON;
  const defaultUrl = mode === "whitelabel" ? WHITELABEL_APP_URL : DEFAULT_APP_URL;
  // parentName and parentUrl are only set in whitelabel mode by default
  const defaultParentName = mode === "whitelabel" ? WHITELABEL_PARENT_NAME : undefined;
  const defaultParentUrl = mode === "whitelabel" ? WHITELABEL_PARENT_URL : undefined;

  return {
    name: getEnv("APP_NAME", "NEXT_PUBLIC_APP_NAME") ?? defaultName,
    icon: getEnv("APP_ICON", "NEXT_PUBLIC_APP_ICON") ?? defaultIcon,
    url: getEnv("APP_URL", "NEXT_PUBLIC_APP_URL") ?? defaultUrl,
    parentName: getEnv("APP_PARENT_NAME", "NEXT_PUBLIC_APP_PARENT_NAME") ?? defaultParentName,
    parentUrl: getEnv("APP_PARENT_URL", "NEXT_PUBLIC_APP_PARENT_URL") ?? defaultParentUrl,
    chartColors: DEFAULT_CHART_COLORS,
    // onboardingRedirectUrl is only set in whitelabel mode
    onboardingRedirectUrl: mode === "whitelabel" 
      ? (brandId: string) => `https://app.whitelabel-client.com/search/onboarding?org_id=${brandId}`
      : undefined,
  };
}

// ============================================================================
// Features Configuration (client-safe)
// ============================================================================

/**
 * Get features configuration based on deployment mode
 */
export function getFeatures(): FeaturesConfig {
  const mode = getDeploymentMode();
  
  switch (mode) {
    case "demo":
      return {
        readOnly: true,
        adminAccess: "readonly",
      };
    case "local":
      return {
        readOnly: false,
        adminAccess: "full",
      };
    case "whitelabel":
    default:
      return {
        readOnly: false,
        adminAccess: "full",
      };
  }
}

/**
 * Check if the current deployment is in read-only mode
 */
export function isReadOnly(): boolean {
  return getFeatures().readOnly;
}

/**
 * Check if admin access is enabled and at what level
 */
export function getAdminAccess(): false | "full" | "readonly" {
  return getFeatures().adminAccess;
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
 * Check if authentication is required for this deployment mode
 */
export function requiresAuthentication(): boolean {
  const mode = getDeploymentMode();
  return mode === "whitelabel" || mode === "cloud";
}

// ============================================================================
// Client-safe config object (for backwards compatibility)
// ============================================================================

export interface ClientConfig {
  mode: DeploymentMode;
  features: FeaturesConfig;
  branding: BrandingConfig;
}

/**
 * Get the complete client-safe configuration
 */
export function getClientConfig(): ClientConfig {
  return {
    mode: getDeploymentMode(),
    features: getFeatures(),
    branding: getBranding(),
  };
}

// Export types
export type { DeploymentMode, BrandingConfig, FeaturesConfig } from "@workspace/config/types";
