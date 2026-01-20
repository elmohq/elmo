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
}

/**
 * Default organization configuration for local/demo modes
 */
export interface DefaultOrganization {
  id: string;
  name: string;
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
  /** Callback to generate onboarding redirect URL (optional) */
  onboardingRedirectUrl?: (brandId: string) => string | undefined;
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
 * Organization management interface
 */
export interface OrganizationManager {
  /** List organizations the user has access to */
  list(): Promise<Organization[]>;
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
  /** Clear any cached authentication data */
  clearCache(): Promise<void>;
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
  /** Redis client for caching (optional) */
  redis?: {
    get<T>(key: string): Promise<T | null>;
    setex(key: string, seconds: number, value: string): Promise<void>;
    del(key: string): Promise<void>;
  };
  /** Database query functions (optional) */
  db?: {
    getAllBrands(): Promise<Organization[]>;
  };
  /** Environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
}
