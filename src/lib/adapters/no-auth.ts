import type { AuthAdapter, AuthProvider, User, Organization } from './types';

export class NoAuthAdapter implements AuthAdapter {
  async getCurrentUser(): Promise<User | null> {
    // In open source version, return a mock user or null
    return {
      id: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User',
    };
  }

  async getOrganization(): Promise<Organization | null> {
    return {
      id: 'demo-org',
      name: 'Demo Organization',
      slug: 'demo-org',
    };
  }

  async requireAuth(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }
    return user;
  }

  async signOut(): Promise<void> {
    // No-op in open source
  }

  async requireAuthInRoute(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }
    return user;
  }
}

export const NoAuthProvider: AuthProvider = {
  Provider: ({ children }) => children,
  useAuth: () => ({
    user: {
      id: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User',
    },
    isLoaded: true,
  }),
};