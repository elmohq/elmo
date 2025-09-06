import type {
  Organization,
  OrganizationAdapter,
} from "@elmo/shared/lib/adapters/types";

export class ClerkOrgAdapter implements OrganizationAdapter {
  getCurrentOrganization(): Promise<Organization | null> {
    // In the cloud version, organization state is managed by Clerk hooks
    // This adapter is mainly for server-side operations
    return Promise.resolve(null);
  }

  getOrganizations(): Promise<Organization[]> {
    // Organizations are managed client-side by Clerk hooks
    return Promise.resolve([]);
  }

  switchOrganization(_orgId: string): Promise<void> {
    // Organization switching is handled client-side by Clerk hooks
    return Promise.resolve();
  }

  hasOrganizations(): Promise<boolean> {
    // This is determined client-side by Clerk hooks
    return Promise.resolve(true);
  }

  isLoaded(): boolean {
    // Loading state is managed client-side by Clerk hooks
    return true;
  }

  canManageOrganization(): Promise<boolean> {
    // Permission checking is done client-side by Clerk hooks
    return Promise.resolve(false);
  }

  openOrganizationProfile(): void {
    // This is handled by Clerk's client-side hooks
  }

  openCreateOrganization(): void {
    // This is handled by Clerk's client-side hooks
  }
}
