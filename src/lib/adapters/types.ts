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
}