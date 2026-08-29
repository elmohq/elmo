/**
 * What an organization offers, as rows.
 *
 * Three surfaces draw this tree — the directory `/app` and the 404 render, the
 * account menu, and the organization's Brands page — with different elements:
 * only a menu item joins the menu's roving focus, and only the directory has
 * room for a tooltip. What they must agree on is what rows there are, in what
 * order, what each says, and where each leads; that is this, and the markup is
 * each surface's own.
 */
import type { OrganizationBrand, OrganizationSummary } from "@/lib/organizations/types";

export type OrganizationTreeChild =
	| { kind: "brand"; brand: OrganizationBrand }
	/** A row that leads into the organization rather than into one of its brands. */
	| { kind: "action"; to: "/app/org/$org/new" | "/app/org/$org"; label: string };

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
			kind: "action",
			to: "/app/org/$org/new",
			label: organization.brands.length > 0 ? "New brand" : "Create your first brand",
		});
	} else if (organization.brands.length === 0 && organization.brandCreation.kind === "not-offered") {
		// Auth0 filled this organization and nobody has set it up. The wizard at
		// `/app/org/$org` is the only way in, so every list of what an
		// organization holds has to offer it.
		children.push({ kind: "action", to: "/app/org/$org", label: `Set up ${organization.name}` });
	}

	return { settingsLabel: `${organization.name} organization settings`, children };
}
