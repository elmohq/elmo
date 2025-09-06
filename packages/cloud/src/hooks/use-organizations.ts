"use client";

import type { Organization } from "@elmo/shared/lib/adapters/types";
import { useClerkOrganizations } from "../lib/adapters/clerk-org";

interface UseOrganizationsReturn {
  currentOrganization: Organization | null;
  organizations: Organization[];
  hasOrganizations: boolean;
  isLoaded: boolean;
  orgId: string | null;
  canManageOrganization: boolean;
  switchOrganization: (orgId: string) => Promise<void>;
  openOrganizationProfile?: () => void;
  openCreateOrganization?: () => void;
}

export function useOrganizations(): UseOrganizationsReturn {
  const {
    currentOrganization,
    organizations,
    hasOrganizations,
    isLoaded,
    canManageOrganization,
    switchOrganization,
    openOrganizationProfile,
    openCreateOrganization,
  } = useClerkOrganizations();

  return {
    currentOrganization,
    organizations,
    hasOrganizations,
    isLoaded,
    orgId: currentOrganization?.id || null,
    canManageOrganization,
    switchOrganization,
    openOrganizationProfile,
    openCreateOrganization,
  };
}
