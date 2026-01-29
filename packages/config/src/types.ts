/**
 * Core types and interfaces for deployment configuration
 * 
 * This package defines the contracts that all deployment mode implementations must follow.
 * Actual implementations live in local, demo, whitelabel, etc.
 */

/**
 * Deployment modes supported by the application
 */
export type DeploymentMode = "whitelabel" | "local" | "demo" | "cloud";

/**
 * Feature flags for deployment modes
 */
export interface FeaturesConfig {
  /** Block all write operations (demo mode) */
  readOnly: boolean;
  /** Admin panel access level: false = disabled, "full" = full access, "readonly" = view only */
  adminAccess: false | "full" | "readonly";
  /** Whether the optimize button should be shown */
  showOptimizeButton: boolean;
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Whether multi-org brand switching is supported */
  supportsMultiOrg: boolean;
}

/**
 * Default organization configuration for local/demo modes
 */
export interface DefaultOrganization {
  id: string;
  name: string;
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** Plausible analytics domain (optional) */
  plausibleDomain?: string;
  /** Microsoft Clarity project ID (optional) */
  clarityProjectId?: string;
}

/**
 * Branding configuration
 */
export interface BrandingConfig {
  /** Application name */
  name: string;
  /** Path to the application icon */
  icon: string;
  /** Application URL */
  url: string;
  /** Parent company name (optional) */
  parentName?: string;
  /** Parent company URL (optional) */
  parentUrl?: string;
  /** Callback to generate onboarding redirect URL with brandId (optional, redirects after PromptWizard completion) */
  onboardingRedirectUrl?: (brandId: string) => string | undefined;
  /** URL template for optimization links with placeholders: {brandId}, {prompt}, {webQuery} (optional, whitelabel only) */
  optimizationUrlTemplate?: string;
  /** Chart color palette */
  chartColors: string[];
}

// ============================================================================
// Auth Provider Types
// ============================================================================

/**
 * Represents a user session
 */
export interface Session {
  user: {
    id: string;
    name?: string;
    email?: string;
    picture?: string;
  };
}

/**
 * Represents an organization the user has access to
 */
export interface Organization {
  id: string;
  name: string;
}

/**
 * Options for listing organizations
 */
export interface OrganizationListOptions {
  /** Force refresh from source, bypassing any cache */
  forceRefresh?: boolean;
}

/**
 * Organization management interface
 */
export interface OrganizationManager {
  /** List organizations the user has access to */
  list(options?: OrganizationListOptions): Promise<Organization[]>;
  /** Check if the user can create new organizations */
  canCreate(): boolean;
  /** Create a new organization (throws if not supported) */
  create?(name: string): Promise<Organization>;
  /** Check if user has access to a specific organization */
  hasAccess(orgId: string): Promise<boolean>;
}

/**
 * Auth provider interface - must be implemented by each deployment mode
 */
export interface AuthProvider {
  /** Get the current user session */
  getSession(): Promise<Session | null>;
  /** Organization management */
  organizations: OrganizationManager;
  /** Check if the user is an admin */
  isAdmin(): Promise<boolean>;
  /** Check if the user has report generator access */
  hasReportGeneratorAccess(): Promise<boolean>;
}

// ============================================================================
// Deployment Config Interface
// ============================================================================

/**
 * Complete deployment configuration interface
 * Each config-* package must provide an implementation of this
 */
export interface DeploymentConfig {
  /** Current deployment mode */
  mode: DeploymentMode;
  /** Feature flags */
  features: FeaturesConfig;
  /** Default organization for local/demo modes */
  defaultOrganization?: DefaultOrganization;
  /** Branding configuration */
  branding: BrandingConfig;
  /** Auth provider instance */
  authProvider: AuthProvider;
}

/**
 * Factory function type for creating deployment configs
 * Each config-* package exports a function matching this signature
 */
export type DeploymentConfigFactory = (options?: {
  dependencies?: ConfigDependencies;
  overrides?: Partial<Pick<DeploymentConfig, "branding" | "defaultOrganization">>;
}) => DeploymentConfig;

/**
 * Dependencies that can be injected into config implementations
 */
export interface ConfigDependencies {
  /** Database query functions (optional) */
  db?: {
    getAllBrands(): Promise<Organization[]>;
  };
  /** Environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
}

// ============================================================================
// Client Config (Browser-Safe)
// ============================================================================

/**
 * Client-safe configuration that can be used in browser code
 * Does NOT include auth providers or server-side dependencies
 */
export interface ClientConfig {
  /** Current deployment mode */
  mode: DeploymentMode;
  /** Feature flags */
  features: FeaturesConfig;
  /** Branding configuration */
  branding: BrandingConfig;
  /** Analytics configuration */
  analytics: AnalyticsConfig;
  /** Default organization (for local/demo modes) */
  defaultOrganization?: DefaultOrganization;
}

/**
 * Factory function type for creating client configs
 */
export type ClientConfigFactory = (env?: Record<string, string | undefined>) => ClientConfig;

// ============================================================================
// Server Config (Server-Side Only)
// ============================================================================

/**
 * Server-side configuration including auth provider
 */
export interface ServerConfig {
  /** Current deployment mode */
  mode: DeploymentMode;
  /** Feature flags */
  features: FeaturesConfig;
  /** Branding configuration */
  branding: BrandingConfig;
  /** Default organization (for local/demo modes) */
  defaultOrganization?: DefaultOrganization;
  /** Auth provider instance */
  authProvider: AuthProvider;
  /** Handle proxy authentication (mode-specific implementation) */
  handleProxyAuth: ProxyAuthHandler;
}

/**
 * Proxy auth handler signature
 */
export type ProxyAuthHandler = (
  request: unknown, // NextRequest
  pathname: string
) => Promise<Response>;

/**
 * Factory function type for creating server configs
 */
export type ServerConfigFactory = (env?: Record<string, string | undefined>) => ServerConfig;

// ============================================================================
// Environment Requirements
// ============================================================================

/**
 * Environment variable requirement
 */
export interface EnvRequirement {
  /** Unique identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description of what this env var is for */
  description?: string;
  /** Check if the requirement is satisfied */
  isSatisfied: (env: Record<string, string | undefined>) => boolean;
}

// ============================================================================
// Deployment Package Interface
// ============================================================================

/**
 * Interface that each deployment package must implement
 * This allows build-time swapping of deployment implementations
 */
export interface DeploymentPackage {
  /** Create client-safe configuration */
  createClientConfig: ClientConfigFactory;
  /** Create server-side configuration */
  createServerConfig: ServerConfigFactory;
  /** Get environment variable requirements for this deployment mode */
  getEnvRequirements: () => EnvRequirement[];
  /** The deployment mode this package provides */
  mode: DeploymentMode;
}
