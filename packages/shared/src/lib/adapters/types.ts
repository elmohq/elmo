import type React from "react";
import type { ReactNode } from "react";

export type User = {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
};

export type OrganizationAdapter = {
  getCurrentOrganization(): Promise<Organization | null>;
  getOrganizations(): Promise<Organization[]>;
  switchOrganization(orgId: string): Promise<void>;
  hasOrganizations(): Promise<boolean>;
  isLoaded(): boolean;
  canManageOrganization(): Promise<boolean>;
  createOrganization?(name: string): Promise<Organization>;
  openOrganizationProfile?(): void;
  openCreateOrganization?(): void;
};

export type AuthAdapter = {
  getCurrentUser(): Promise<User | null>;
  getOrganization(id?: string): Promise<Organization | null>;
  requireAuth(): Promise<User>;
  signOut(): Promise<void>;
  // For API routes
  requireAuthInRoute(): Promise<User>;
};

export type AuthProvider = {
  // React component that wraps the app
  Provider: React.ComponentType<{ children: ReactNode }>;
  // Hook for checking auth status in components
  useAuth: () => { user: User | null; isLoaded: boolean };
  // Component for sign-in UI
  SignIn?: React.ComponentType;
  // Component for user button/menu
  UserButton?: React.ComponentType;
};

export type PaymentAdapter = {
  createCheckoutSession(params: {
    priceId: string;
    orgId: string;
  }): Promise<{ url: string }>;
  createPortalSession(orgId: string): Promise<{ url: string }>;
  getSubscription(orgId: string): Promise<{
    id: string;
    status: string;
    priceId: string;
    currentPeriodEnd: number;
  } | null>;
};

export type NavigationLink = {
  title: string;
  url: string;
  external?: boolean;
};

export type AppConfig = {
  features: {
    auth: boolean;
    billing: boolean;
    organizations: boolean;
  };
  navigation: {
    showLinks: boolean;
    links: NavigationLink[];
  };
  adapters: {
    auth: AuthAdapter;
    organization: OrganizationAdapter;
    payment?: PaymentAdapter;
  };
  providers: {
    auth: AuthProvider;
  };
};
