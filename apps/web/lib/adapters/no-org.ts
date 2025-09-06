import type { Organization, OrganizationAdapter } from "./types";

export class NoOrgAdapter implements OrganizationAdapter {
  private defaultOrg: Organization = {
    id: "default",
    name: "Dashboard",
    slug: "default",
    imageUrl: undefined,
  };

  async getCurrentOrganization(): Promise<Organization | null> {
    return this.defaultOrg;
  }

  async getOrganizations(): Promise<Organization[]> {
    return [this.defaultOrg];
  }

  async switchOrganization(_orgId: string): Promise<void> {
    // No-op in open source - only one organization
  }

  async hasOrganizations(): Promise<boolean> {
    return true; // Always has the default organization
  }

  isLoaded(): boolean {
    return true; // Always loaded in open source
  }

  async canManageOrganization(): Promise<boolean> {
    return false; // No management UI in open source
  }
}
