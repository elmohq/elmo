import type { ReactNode } from 'react';
import type React from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
}

export interface AuthAdapter {
  getCurrentUser(): Promise<User | null>;
  getOrganization(id?: string): Promise<Organization | null>;
  requireAuth(): Promise<User>;
  signOut(): Promise<void>;
  // For API routes
  requireAuthInRoute(): Promise<User>;
}

export interface AuthProvider {
  // React component that wraps the app
  Provider: React.ComponentType<{ children: ReactNode }>;
  // Hook for checking auth status in components
  useAuth: () => { user: User | null; isLoaded: boolean };
  // Component for sign-in UI
  SignIn?: React.ComponentType;
  // Component for user button/menu
  UserButton?: React.ComponentType;
}

export interface PaymentAdapter {
  createCheckoutSession(params: {
    priceId: string;
    orgId: string;
  }): Promise<{ url: string }>;
  createPortalSession(orgId: string): Promise<{ url: string }>;
  getSubscription(orgId: string): Promise<any>;
}

export interface AppConfig {
  features: {
    auth: boolean;
    billing: boolean;
    organizations: boolean;
  };
  adapters: {
    auth: AuthAdapter;
    payment?: PaymentAdapter;
  };
  providers: {
    auth: AuthProvider;
  };
}