import type {
  AuthAdapter,
  AuthProvider,
  Organization,
  User,
} from "@elmo/shared/lib/adapters/types";

export class NoAuthAdapter implements AuthAdapter {
  getCurrentUser(): Promise<User | null> {
    // In open source version, return a mock user or null
    return Promise.resolve({
      id: "demo-user",
      email: "demo@example.com",
      name: "Demo User",
    });
  }

  getOrganization(): Promise<Organization | null> {
    return Promise.resolve({
      id: "demo-org",
      name: "Demo Organization",
      slug: "demo-org",
    });
  }

  async requireAuth(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error("Authentication required");
    }
    return user;
  }

  signOut(): Promise<void> {
    // No-op in open source
    return Promise.resolve();
  }

  async requireAuthInRoute(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error("Authentication required");
    }
    return user;
  }
}

export const NoAuthProvider: AuthProvider = {
  Provider: ({ children }) => children,
  useAuth: () => ({
    user: {
      id: "demo-user",
      email: "demo@example.com",
      name: "Demo User",
    },
    isLoaded: true,
  }),
};
