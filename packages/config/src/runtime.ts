/**
 * Runtime Configuration Management
 * 
 * Provides global config state management for the application.
 */

import type { DeploymentConfig, BrandingConfig, FeaturesConfig, AuthProvider, Organization, Session } from "./types";

// Global config instance (set by the app at startup)
let currentConfig: DeploymentConfig | null = null;

/**
 * Initialize the deployment configuration
 * This should be called once at app startup by the main application
 * 
 * @param config The deployment configuration to use
 */
export function initializeConfig(config: DeploymentConfig): void {
  currentConfig = config;
}

/**
 * Get the current deployment configuration
 * 
 * @throws Error if config has not been initialized
 */
export function getConfig(): DeploymentConfig {
  if (!currentConfig) {
    throw new Error(
      "Deployment configuration has not been initialized. " +
      "Call initializeConfig() at app startup."
    );
  }
  return currentConfig;
}

/**
 * Check if config has been initialized
 */
export function isConfigInitialized(): boolean {
  return currentConfig !== null;
}

/**
 * Clear the configuration (useful for testing)
 */
export function clearConfig(): void {
  currentConfig = null;
}

// ============================================================================
// Convenience Accessors
// ============================================================================

/**
 * Get the branding configuration
 */
export function getBranding(): BrandingConfig {
  return getConfig().branding;
}

/**
 * Get the features configuration
 */
export function getFeatures(): FeaturesConfig {
  return getConfig().features;
}

/**
 * Check if the current deployment is in read-only mode
 */
export function isReadOnly(): boolean {
  return getConfig().features.readOnly;
}

/**
 * Check if admin access is enabled and at what level
 */
export function getAdminAccess(): false | "full" | "readonly" {
  return getConfig().features.adminAccess;
}

/**
 * Check if admin panel is accessible (either full or readonly)
 */
export function isAdminAccessible(): boolean {
  const access = getConfig().features.adminAccess;
  return access === "full" || access === "readonly";
}

/**
 * Check if admin has full write access
 */
export function hasFullAdminAccess(): boolean {
  return getConfig().features.adminAccess === "full";
}

/**
 * Get the auth provider
 */
export function getAuthProvider(): AuthProvider {
  return getConfig().authProvider;
}

// ============================================================================
// Auth Convenience Functions (delegate to auth provider)
// ============================================================================

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
