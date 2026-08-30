/**
 * What an organization offers, as rows.
 *
 * Three surfaces draw this — the directory, the account menu, and the Brands
 * page — each with its own element, because only a menu item joins the menu's
 * roving focus and only the directory has room for a tooltip. What rows there
 * are, in what order, what each says and where each leads is decided here, so
 * no surface can send one somewhere else.
 */
import type { LinkProps } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import type { OrganizationSummary } from "@/lib/organizations/types";

interface RowBase {
	/** The React key, unique within one organization. */
	key: string;
	link: LinkProps;
	label: string;
}

/**
 * Tagged, because the three kinds lead to different sorts of place — a surface
 * reading "no brand here" as "this row adds one" is how the setup row ends up
 * wearing a plus.
 */
export type OrganizationRow =
	| (RowBase & { kind: "brand"; id: string; website: string })
	| (RowBase & { kind: "new-brand" })
	| (RowBase & { kind: "set-up" });

export interface OrganizationTree {
	/** Addressable like the rows, so neither surface decides where the name leads. */
	heading: RowBase & { ariaLabel: string };
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

	// A plan's brand allowance is spent per organization, so one list can offer
	// creation in one and not another.
	if (organization.brandCreation.kind === "allowed") {
		children.push({
			kind: "new-brand",
			key: "new-brand",
			link: { to: "/app/org/$org/new", params },
			label: organization.brands.length > 0 ? "New brand" : "Create your first brand",
		});
	} else if (needsSetup(organization)) {
		// The wizard at `/app/org/$org` is the only way in, so every list of what
		// an organization holds has to offer it.
		children.push({
			kind: "set-up",
			key: "set-up",
			link: { to: "/app/org/$org", params },
			label: `Set up ${organization.name}`,
		});
	}

	return {
		heading: {
			key: organization.id,
			link: { to: "/app/org/$org/settings", params },
			label: organization.name,
			ariaLabel: `${organization.name} organization settings`,
		},
		children,
	};
}

/**
 * Whether `/app/org/$org` is a wizard rather than a redirect to the settings.
 *
 * An empty organization this deployment doesn't create brands in is one Auth0
 * filled and nobody set up. A plan that says not right now is waiting on
 * billing, and the wizard would be a dead end for it.
 *
 * Here rather than beside the route, because the row linking to that wizard is
 * minted above — asked in two places, the answers could disagree.
 */
export function needsSetup(organization: OrganizationSummary): boolean {
	return organization.brands.length === 0 && organization.brandCreation.kind === "not-offered";
}
