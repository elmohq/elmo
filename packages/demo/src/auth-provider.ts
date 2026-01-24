import { LocalAuthProvider } from "@workspace/local/auth-provider";
import type { ConfigDependencies, DefaultOrganization } from "@workspace/config/types";

/**
 * Demo auth provider - extends LocalAuthProvider with restricted permissions
 * 
 * This provider:
 * - Returns a fixed "demo-user" session
 * - Provides read-only admin access (can view but not modify)
 * - Does not grant report generator access
 */
export class DemoAuthProvider extends LocalAuthProvider {
  constructor(
    defaultOrganization?: DefaultOrganization,
    dependencies?: ConfigDependencies
  ) {
    super(defaultOrganization, dependencies);
  }

  /**
   * Returns a fixed demo user session
   */
  async getSession() {
    return {
      user: {
        id: "demo-user",
        name: "Demo User",
        email: "demo@example.com",
      },
    };
  }

  /**
   * Demo mode grants admin access (read-only, enforced at API level)
   * This allows viewing admin pages but the proxy blocks write operations
   */
  async isAdmin(): Promise<boolean> {
    return true;
  }

  /**
   * Demo mode does not grant report generator access
   */
  async hasReportGeneratorAccess(): Promise<boolean> {
    return false;
  }
}
