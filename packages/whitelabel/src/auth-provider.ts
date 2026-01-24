import type {
  AuthProvider,
  Organization,
  Session,
} from "@workspace/config/types";

/**
 * Auth0 app metadata structure
 */
export interface Auth0AppMetadata {
  elmo_orgs?: Organization[];
  elmo_report_generator_access?: boolean;
  elmo_admin?: boolean;
}

/**
 * Extended session with cached app metadata
 * The beforeSessionSaved hook maintains this, proxy triggers refresh when stale
 */
export interface Auth0SessionWithMetadata {
  user?: { sub?: string; name?: string; email?: string; picture?: string };
  tokenSet?: { refreshToken?: string; accessToken?: string; expiresAt?: number };
  /** Cached app metadata from Management API */
  elmoAppMetadata?: Auth0AppMetadata;
  /** Timestamp when metadata was fetched (Unix seconds) */
  elmoAppMetadataFetchedAt?: number;
}

// Cache TTL in seconds (15 minutes)
export const APP_METADATA_CACHE_TTL = 60 * 15;
const FALLBACK_REFRESH_PROBABILITY = 0.15;

/**
 * Auth0 auth provider for whitelabel deployment mode
 * 
 * This provider:
 * - Uses Auth0 for session management
 * - Reads organizations from Auth0 app_metadata.elmo_orgs
 * - Does not support organization creation (managed in Auth0)
 * - Reads admin status from Auth0 app_metadata
 * - App metadata is cached in the session by the proxy (refreshed ~every 15 min)
 */
export class Auth0AuthProvider implements AuthProvider {
  private auth0Client: {
    getSession(req?: unknown): Promise<Auth0SessionWithMetadata | null>;
    middleware(req: unknown): Promise<Response>;
    updateSession(req: unknown, res: Response, session: Auth0SessionWithMetadata): Promise<void>;
  };
  private managementClient: {
    users: {
      get(params: { id: string; fields: string }): Promise<{ data?: { app_metadata?: Auth0AppMetadata } }>;
    };
  };

  constructor(
    auth0Client: Auth0AuthProvider["auth0Client"],
    managementClient: Auth0AuthProvider["managementClient"]
  ) {
    this.auth0Client = auth0Client;
    this.managementClient = managementClient;
  }

  /**
   * Get the Auth0 client (for use in proxy/middleware)
   */
  getAuth0Client() {
    return this.auth0Client;
  }

  /**
   * Check if the session's app metadata needs refreshing
   * Used by the proxy to determine when to trigger updateSession
   */
  needsMetadataRefresh(session: Auth0SessionWithMetadata): boolean {
    if (!session.elmoAppMetadata || !session.elmoAppMetadataFetchedAt) {
      return true;
    }
    const now = Math.floor(Date.now() / 1000);
    const age = now - session.elmoAppMetadataFetchedAt;
    return age >= APP_METADATA_CACHE_TTL;
  }

  /**
   * Get the current user session from Auth0
   */
  async getSession(): Promise<Session | null> {
    const session = await this.auth0Client.getSession();
    
    if (!session?.user?.sub) {
      return null;
    }
    
    return {
      user: {
        id: session.user.sub,
        name: session.user.name,
        email: session.user.email,
        picture: session.user.picture,
      },
    };
  }

  /**
   * Get Auth0 app metadata for the current user
   * 
   * Primary: Reads from session (maintained by beforeSessionSaved hook)
   * Fallback: Management API (for edge cases where session wasn't updated)
   * Throttling: Only triggers fallback refresh on a percentage of requests
   */
  private async getAppMetadata(): Promise<Auth0AppMetadata> {
    const session = await this.auth0Client.getSession();
    
    if (!session?.user?.sub) {
      return {};
    }
    
    const userId = session.user.sub;
    const now = Math.floor(Date.now() / 1000);
    
    // Primary: Read from session (maintained by proxy's handleProxyAuth)
    if (session.elmoAppMetadata && session.elmoAppMetadataFetchedAt) {
      const age = now - session.elmoAppMetadataFetchedAt;
      if (age < APP_METADATA_CACHE_TTL) {
        return session.elmoAppMetadata;
      }

      if (Math.random() > FALLBACK_REFRESH_PROBABILITY) {
        return session.elmoAppMetadata;
      }
    }
    
    // Fallback: Fetch from Auth0 Management API
    console.log("Fallback: Fetching app_metadata from Auth0 Management API for user:", userId);
    try {
      const userData = await this.managementClient.users.get({
        id: userId,
        fields: "app_metadata",
      });
      return userData.data?.app_metadata || {};
    } catch (error) {
      console.error("Error fetching app_metadata from Management API:", error);
      // If we have stale metadata, return it rather than nothing
      return session.elmoAppMetadata || {};
    }
  }

  /**
   * Organization management for Auth0
   */
  organizations = {
    /**
     * List organizations from Auth0 app_metadata.elmo_orgs
     */
    list: async (): Promise<Organization[]> => {
      const appMetadata = await this.getAppMetadata();
      return appMetadata.elmo_orgs || [];
    },

    /**
     * Auth0 does not support creating organizations through the app
     * Organizations are managed externally in Auth0
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
   * Check if the user is an admin from Auth0 app_metadata
   */
  async isAdmin(): Promise<boolean> {
    const appMetadata = await this.getAppMetadata();
    return appMetadata.elmo_admin === true;
  }

  /**
   * Check if the user has report generator access from Auth0 app_metadata
   */
  async hasReportGeneratorAccess(): Promise<boolean> {
    const appMetadata = await this.getAppMetadata();
    return appMetadata.elmo_report_generator_access === true;
  }
}
