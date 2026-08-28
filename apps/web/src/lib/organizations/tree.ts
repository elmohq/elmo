/**
 * What an organization offers, as rows.
 *
 * Two surfaces draw this tree — the directory `/app` and the 404 render, and the
 * account menu — and they draw it with different elements: only a menu item
 * joins the menu's roving focus, and only the directory has room for a tooltip.
 * What they must agree on is what rows there are, in what order, and what each
 * says; that is this, and the markup is each surface's own.
 */
import type { OrganizationBrand, OrganizationSummary } from "@/lib/organizations/types";

export type OrganizationTreeChild = { kind: "brand"; brand: OrganizationBrand } | { kind: "new-brand"; label: string };

export interface OrganizationTree {
	/** The heading names the organization and leads to the one thing it could. */
	settingsLabel: string;
	/** Rendered under a rule. Empty means the heading is the whole entry. */
	children: OrganizationTreeChild[];
}

export function organizationTree(organization: OrganizationSummary): OrganizationTree {
	const children: OrganizationTreeChild[] = organization.brands.map((brand) => ({ kind: "brand", brand }));

	// A plan's brand allowance is spent per organization, so the same list can
	// offer creation in one and not another.
	if (organization.brandCreation.kind === "allowed") {
		children.push({
			kind: "new-brand",
			label: organization.brands.length > 0 ? "New brand" : "Create your first brand",
		});
	}

	return { settingsLabel: `${organization.name} organization settings`, children };
}
