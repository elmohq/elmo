import type {
  AuthProvider,
  Organization,
  Session,
  ConfigDependencies,
  DefaultOrganization,
} from "@workspace/config/types";

/**
 * Local auth provider for local development mode
 * 
 * This provider:
 * - Returns a fixed "local-user" session
 * - Provides a single organization from config (or falls back to DB)
 * - Does not support organization creation
 * - Grants full admin access
 */
export class LocalAuthProvider implements AuthProvider {
  private dependencies: ConfigDependencies;
  private defaultOrganization?: DefaultOrganization;

  constructor(
    defaultOrganization?: DefaultOrganization,
    dependencies: ConfigDependencies = {}
  ) {
    this.defaultOrganization = defaultOrganization;
    this.dependencies = dependencies;
  }

  /**
   * Returns a fixed local user session
   */
  async getSession(): Promise<Session | null> {
    return {
      user: {
        id: "local-user",
        name: "Local User",
        email: "local@localhost",
      },
    };
  }

  /**
   * Organization management for local mode
   */
  organizations = {
    /**
     * List available organizations
     * Returns the default org from config, or falls back to first brand from DB
     */
    list: async (): Promise<Organization[]> => {
      // Return default org from config if available
      if (this.defaultOrganization) {
        return [this.defaultOrganization];
      }
      
      // Fallback: get first brand from database
      if (this.dependencies.db) {
        const brands = await this.dependencies.db.getAllBrands();
        return brands.slice(0, 1);
      }
      
      // No orgs available
      return [];
    },

    /**
     * Local mode does not support creating organizations
     */
    canCreate: (): boolean => {
      return false;
    },

    /**
     * Check if user has access to a specific organization
     */
    hasAccess: async (orgId: string): Promise<boolean> => {
      const orgs = await this.organizations.list();
      return orgs.some((org) => org.id === orgId);
    },
  };

  /**
   * Local mode grants full admin access
   */
  async isAdmin(): Promise<boolean> {
    return true;
  }

  /**
   * Local mode grants report generator access
   */
  async hasReportGeneratorAccess(): Promise<boolean> {
    return true;
  }

  /**
   * No cache to clear in local mode
   */
  async clearCache(): Promise<void> {
    // No-op for local provider
  }
}
