import type {
  AuthProvider,
  Organization,
  Session,
  ConfigDependencies,
} from "@workspace/config/types";

/**
 * Auth0 app metadata structure
 */
export interface Auth0AppMetadata {
  elmo_orgs?: Organization[];
  elmo_report_generator_access?: boolean;
  elmo_admin?: boolean;
}

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 60 * 5;

/**
 * Get Redis cache key for user metadata
 */
function getRedisKey(userId: string): string {
  return `auth0-app-metadata-${userId}`;
}

/**
 * Auth0 auth provider for whitelabel deployment mode
 * 
 * This provider:
 * - Uses Auth0 for session management
 * - Reads organizations from Auth0 app_metadata.elmo_orgs
 * - Does not support organization creation (managed in Auth0)
 * - Reads admin status from Auth0 app_metadata
 */
export class Auth0AuthProvider implements AuthProvider {
  private auth0Client: {
    getSession(req?: unknown): Promise<{ user?: { sub?: string; name?: string; email?: string; picture?: string } } | null>;
    middleware(req: unknown): Promise<Response>;
  };
  private managementClient: {
    users: {
      get(params: { id: string; fields: string }): Promise<{ data?: { app_metadata?: Auth0AppMetadata } }>;
    };
  };
  private dependencies: ConfigDependencies;

  constructor(
    auth0Client: Auth0AuthProvider["auth0Client"],
    managementClient: Auth0AuthProvider["managementClient"],
    dependencies: ConfigDependencies = {}
  ) {
    this.auth0Client = auth0Client;
    this.managementClient = managementClient;
    this.dependencies = dependencies;
  }

  /**
   * Get the Auth0 client (for use in proxy/middleware)
   */
  getAuth0Client() {
    return this.auth0Client;
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
   * Uses Redis caching if available
   */
  private async getAppMetadata(): Promise<Auth0AppMetadata> {
    const session = await this.auth0Client.getSession();
    
    if (!session?.user?.sub) {
      return {};
    }
    
    const userId = session.user.sub;
    const redisKey = getRedisKey(userId);
    
    // Try to get from cache
    if (this.dependencies.redis) {
      try {
        const cachedMetadata = await this.dependencies.redis.get<Auth0AppMetadata>(redisKey);
        if (cachedMetadata) {
          return cachedMetadata;
        }
      } catch (error) {
        console.error("Error fetching from Redis cache:", error);
      }
    }
    
    // Fetch from Auth0 Management API
    try {
      const userData = await this.managementClient.users.get({
        id: userId,
        fields: "app_metadata",
      });
      
      const appMetadata = userData.data?.app_metadata || {};
      
      // Cache the result
      if (this.dependencies.redis) {
        try {
          await this.dependencies.redis.setex(redisKey, CACHE_TTL, JSON.stringify(appMetadata));
        } catch (error) {
          console.error("Error caching to Redis:", error);
        }
      }
      
      return appMetadata;
    } catch (error) {
      console.error("Error fetching app_metadata from Management API:", error);
      return {};
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

  /**
   * Clear the cached app metadata for the current user
   */
  async clearCache(): Promise<void> {
    if (!this.dependencies.redis) {
      return;
    }
    
    const session = await this.auth0Client.getSession();
    
    if (!session?.user?.sub) {
      return;
    }
    
    const userId = session.user.sub;
    const redisKey = getRedisKey(userId);
    
    try {
      await this.dependencies.redis.del(redisKey);
    } catch (error) {
      console.error("Error clearing Redis cache:", error);
    }
  }
}
