import type {
  Organization,
  OrganizationAdapter,
} from "@elmo/shared/lib/adapters/types";

export class NoOrgAdapter implements OrganizationAdapter {
  private readonly defaultOrg: Organization = {
    id: "default",
    name: "Dashboard",
    slug: "default",
    imageUrl: undefined,
  };

  getCurrentOrganization(): Promise<Organization | null> {
    return Promise.resolve(this.defaultOrg);
  }

  getOrganizations(): Promise<Organization[]> {
    return Promise.resolve([this.defaultOrg]);
  }

  switchOrganization(_orgId: string): Promise<void> {
    // No-op in open source - only one organization
    return Promise.resolve();
  }

  hasOrganizations(): Promise<boolean> {
    return Promise.resolve(true); // Always has the default organization
  }

  isLoaded(): boolean {
    return true; // Always loaded in open source
  }

  canManageOrganization(): Promise<boolean> {
    return Promise.resolve(false); // No management UI in open source
  }
}
