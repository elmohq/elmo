// Client-side organization adapter for Clerk
"use client";

import { useClerk, useOrganization, useOrganizationList } from "@clerk/nextjs";
import type {
  Organization,
  OrganizationAdapter,
} from "@elmo/shared/lib/adapters/types";

export class ClerkOrgAdapter implements OrganizationAdapter {
  getCurrentOrganization(): Promise<Organization | null> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return Promise.resolve(null);
  }

  getOrganizations(): Promise<Organization[]> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return Promise.resolve([]);
  }

  switchOrganization(_orgId: string): Promise<void> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return Promise.resolve();
  }

  hasOrganizations(): Promise<boolean> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return Promise.resolve(false);
  }

  isLoaded(): boolean {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return false;
  }

  canManageOrganization(): Promise<boolean> {
    // This is a client-side adapter, so we need to use hooks
    // This method won't work directly - we need to use the hook in a component
    return Promise.resolve(false);
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
    setActive,
  } = useOrganizationList();
  const { openOrganizationProfile, openCreateOrganization } = useClerk();

  const currentOrganization: Organization | null = organization
    ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug || organization.id,
        imageUrl: organization.imageUrl,
      }
    : null;

  const organizations: Organization[] =
    userMemberships?.data?.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug ?? membership.organization.id,
      imageUrl: membership.organization.imageUrl ?? undefined,
    })) || [];

  const hasOrganizations = organizations.length > 0 || !!currentOrganization;
  const isLoaded = orgLoaded && listLoaded;

  const switchOrganization = async (orgId: string) => {
    const targetMembership = userMemberships?.data?.find(
      (membership: { organization: { id: string } }) =>
        membership.organization.id === orgId
    );
    if (targetMembership && setActive) {
      await setActive({ organization: targetMembership.organization });
    }
  };

  const currentMembership = userMemberships?.data?.find(
    (membership: { organization: { id: string }; role: string }) =>
      membership.organization.id === organization?.id
  );
  const canManageOrganization = currentMembership?.role === "org:admin";

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
