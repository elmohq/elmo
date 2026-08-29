/**
 * What an organization offers, as rows.
 *
 * Three surfaces draw this tree — the directory `/app` and the 404 render, the
 * account menu, and the organization's Brands page — with different elements:
 * only a menu item joins the menu's roving focus, and only the directory has
 * room for a tooltip. What they must agree on is what rows there are, in what
 * order, what each says, and where each leads; that is this, and the element
 * each row is drawn as is the surface's own.
 *
 * A row arrives addressable — `link` already pairs the route with its params —
 * so a surface renders one without deciding where it goes. Three copies of that
 * decision is three chances to send one of them somewhere else.
 */
import type { LinkProps } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import type { OrganizationSummary } from "@/lib/organizations/types";

interface RowBase {
	/** Distinguishes rows within one organization, and is the React key. */
	key: string;
	/** Where the row goes, as the router's own link props — typed, params encoded by it. */
	link: LinkProps;
	label: string;
}

/**
 * Tagged, because the three kinds do not lead to the same sort of place and a
 * surface reading "no brand here" as "this row adds one" is how the setup row
 * ends up wearing a plus.
 */
export type OrganizationRow =
	| (RowBase & { kind: "brand"; id: string; website: string })
	| (RowBase & { kind: "new-brand" })
	| (RowBase & { kind: "set-up" });

export interface OrganizationTree {
	/** The heading names the organization and leads to the one thing it could. */
	settingsLabel: string;
	/** Rendered under a rule. Empty means the heading is the whole entry. */
	children: OrganizationRow[];
}

export function organizationTree(organization: OrganizationSummary): OrganizationTree {
	const children: OrganizationRow[] = organization.brands.map((brand) => ({
		kind: "brand",
		key: brand.id,
		link: { to: "/app/org/$org/brand/$brand", params: brandParams(organization, brand) },
		label: brand.name,
		id: brand.id,
		website: brand.website,
	}));

	const params = orgParams(organization);

	// A plan's brand allowance is spent per organization, so the same list can
	// offer creation in one and not another.
	if (organization.brandCreation.kind === "allowed") {
		children.push({
			kind: "new-brand",
			key: "new-brand",
			link: { to: "/app/org/$org/new", params },
			label: organization.brands.length > 0 ? "New brand" : "Create your first brand",
		});
	} else if (needsSetup(organization)) {
		// Auth0 filled this organization and nobody has set it up. The wizard at
		// `/app/org/$org` is the only way in, so every list of what an
		// organization holds has to offer it.
		children.push({
			kind: "set-up",
			key: "set-up",
			link: { to: "/app/org/$org", params },
			label: `Set up ${organization.name}`,
		});
	}

	return { settingsLabel: `${organization.name} organization settings`, children };
}

/**
 * Whether `/app/org/$org` is a wizard rather than a redirect to the settings.
 *
 * An empty organization this deployment doesn't create brands in is one Auth0
 * filled and nobody set up. A plan that says not right now is waiting on
 * billing rather than on setup, and the wizard would be a dead end for it.
 *
 * Here rather than beside the route, because the row that links to that wizard
 * is minted above: asked in two places, the two answers are what decide whether
 * the link leads to the wizard or bounces off a redirect.
 */
export function needsSetup(organization: OrganizationSummary): boolean {
	return organization.brands.length === 0 && organization.brandCreation.kind === "not-offered";
}
