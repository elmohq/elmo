/**
 * The real module reads the organization/member tables; stories only need the
 * shell to know which organization it is in and what it holds.
 */

import type { OrganizationSummary } from "@/lib/organizations/types";

// The real types, not a copy, so a fixture can't render what the app cannot
// produce.
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

export const listOrganizationsFn = async () => _organizations;
export const updateOrganizationFn = async () => ({ slug: _organizations[0].slug });
export const syncOrganizationMembershipsFn = async () => false;
export const createOrganizationFn = async () => ({ slug: _organizations[0].slug });
