// Client-side organization adapter for Clerk
'use client';

import { useOrganization, useOrganizationList, useClerk } from '@clerk/nextjs';
import type { Organization, OrganizationAdapter } from "@elmo/shared/lib/adapters/types";

export class ClerkOrgAdapter implements OrganizationAdapter {
  private useOrganizationHook: typeof useOrganization;
  private useOrganizationListHook: typeof useOrganizationList;
  private useClerkHook: typeof useClerk;

  constructor() {
    this.useOrganizationHook = useOrganization;
    this.useOrganizationListHook = useOrganizationList;
    this.useClerkHook = useClerk;
  }

  async getCurrentOrganization(): Promise<Organization | null> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return null;
  }

  async getOrganizations(): Promise<Organization[]> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return [];
  }

  async switchOrganization(orgId: string): Promise<void> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
  }

  async hasOrganizations(): Promise<boolean> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return false;
  }

  isLoaded(): boolean {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return false;
  }

  async canManageOrganization(): Promise<boolean> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return false;
  }

  openOrganizationProfile(): void {
    // This needs to be called from a component that has access to useClerk
  }

  openCreateOrganization(): void {
    // This needs to be called from a component that has access to useClerk
  }
}

// Hook-based organization utilities for Clerk
export function useClerkOrganizations(): {
  currentOrganization: Organization | null;
  organizations: Organization[];
  hasOrganizations: boolean;
  isLoaded: boolean;
  canManageOrganization: boolean;
  switchOrganization: (orgId: string) => Promise<void>;
  openOrganizationProfile: (() => void) | undefined;
  openCreateOrganization: (() => void) | undefined;
} {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { 
    userMemberships, 
    isLoaded: listLoaded, 
    setActive 
  } = useOrganizationList();
  const { openOrganizationProfile, openCreateOrganization } = useClerk();

  const currentOrganization: Organization | null = organization ? {
    id: organization.id,
    name: organization.name,
    slug: organization.slug || organization.id,
    imageUrl: organization.imageUrl,
  } : null;

  const organizations: Organization[] = userMemberships?.data?.map((membership: any) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug || membership.organization.id,
    imageUrl: membership.organization.imageUrl,
  })) || [];

  const hasOrganizations = organizations.length > 0 || !!currentOrganization;
  const isLoaded = orgLoaded && listLoaded;

  const switchOrganization = async (orgId: string) => {
    const targetMembership = userMemberships?.data?.find((membership: any) => membership.organization.id === orgId);
    if (targetMembership && setActive) {
      await setActive({ organization: targetMembership.organization });
    }
  };

  const currentMembership = userMemberships?.data?.find((membership: any) => 
    membership.organization.id === organization?.id
  );
  const canManageOrganization = currentMembership?.role === 'org:admin';

  return {
    currentOrganization,
    organizations,
    hasOrganizations,
    isLoaded,
    canManageOrganization,
    switchOrganization,
    openOrganizationProfile,
    openCreateOrganization,
  };
}
