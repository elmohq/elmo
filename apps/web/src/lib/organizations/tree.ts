import type { LinkProps } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import type { OrganizationSummary } from "@/lib/organizations/types";

interface RowBase {
	key: string;
	link: LinkProps;
	label: string;
}

export type OrganizationRow =
	| (RowBase & { kind: "brand"; id: string; website: string })
	| (RowBase & { kind: "new-brand" })
	| (RowBase & { kind: "set-up" });

export interface OrganizationTree {
	heading: RowBase & { ariaLabel: string };
	children: OrganizationRow[];
}

export function organizationTree(organization: OrganizationSummary): OrganizationTree {
	const children: OrganizationRow[] = organization.brands.map((brand) => ({
		kind: "brand",
		key: brand.id,
		link: { to: "/app/org/$org/brand/$brand", params: brandLinkParams(organization, brand) },
		label: brand.name,
		id: brand.id,
		website: brand.website,
	}));

	const params = orgLinkParams(organization);

	if (organization.brandCreation.kind === "allowed") {
		children.push({
			kind: "new-brand",
			key: "new-brand",
			link: { to: "/app/org/$org/new", params },
			label: organization.brands.length > 0 ? "New brand" : "Create your first brand",
		});
	} else if (needsSetup(organization)) {
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

export function needsSetup(organization: OrganizationSummary): boolean {
	return organization.brands.length === 0 && organization.brandCreation.kind === "not-offered";
}
