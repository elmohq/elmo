/**
 * Mock for @/server/organizations used in Storybook stories. The real module reads
 * the organization/member tables; stories only need the shell to know which
 * organization it is in and what it holds.
 */

export type OrganizationBrand = { id: string; slug: string | null; name: string; onboarded: boolean };
export type BrandCreation =
	| { kind: "allowed" }
	| { kind: "denied"; code: string; message: string }
	| { kind: "not-offered" };
export type OrganizationSummary = {
	id: string;
	slug: string;
	name: string;
	brands: OrganizationBrand[];
	brandCreation: BrandCreation;
};

let _organizations: OrganizationSummary[] = [
	{
		id: "org-1",
		slug: "acme",
		name: "Acme",
		brandCreation: { kind: "allowed" },
		brands: [
			{ id: "brand-1", slug: "acme", name: "Acme", onboarded: true },
			{ id: "brand-2", slug: "acme-labs", name: "Acme Labs", onboarded: true },
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
