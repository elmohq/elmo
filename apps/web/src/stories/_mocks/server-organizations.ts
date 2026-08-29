/**
 * Mock for @/server/organizations used in Storybook stories. The real module reads
 * the organization/member tables; stories only need the shell to know which
 * organization it is in and what it holds.
 */

import type { OrganizationSummary } from "@/lib/organizations/types";

// The real types, not a copy: a fixture that drifts from them is a story that
// renders something the app cannot produce.
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
export const resolveOrganizationFn = async () => ({
	organization: _organizations[0],
	isAdmin: false,
	hasReportAccess: false,
});
export const updateOrganizationFn = async () => ({ slug: _organizations[0].slug });
export const listReachableOrganizationsFn = async () => _organizations;
