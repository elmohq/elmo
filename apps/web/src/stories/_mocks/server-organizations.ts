import type { OrganizationSummary } from "@/lib/organizations/types";

let _organizations: OrganizationSummary[] = [
	{
		id: "org-1",
		slug: "acme",
		name: "Acme",
		brandCreation: { kind: "allowed" },
		brands: [
			{ id: "brand-1", slug: "acme", name: "Acme", website: "https://acme.com", onboarded: true },
			{ id: "brand-2", slug: "acme-labs", name: "Acme Labs", website: "https://labs.acme.com", onboarded: true },
		],
	},
];

export function setMockOrganizations(organizations: OrganizationSummary[]) {
	_organizations = organizations;
}

export const listOrganizationsFn = async () => ({ signedIn: true, organizations: _organizations });
export const updateOrganizationFn = async () => ({ slug: _organizations[0].slug });
export const syncOrganizationMembershipsFn = async () => false;
export const createOrganizationFn = async () => ({ slug: _organizations[0].slug });
