import { IconArrowRight, IconPlus } from "@tabler/icons-react";
import { SiteIcon } from "@/components/site-icon";
import type { OrganizationRow } from "@/lib/organizations/tree";

/**
 * What a row of `organizationTree` looks like, for the three surfaces that draw
 * one. They pick their own element and their own emphasis; which mark a row
 * carries is the tree's answer, so a new kind of row can't mean one thing in
 * the menu and another in the directory.
 */
export function OrganizationRowIcon({ row, size }: { row: OrganizationRow; size: "xs" | "md" }) {
	const className = size === "xs" ? "size-3.5" : undefined;

	switch (row.kind) {
		case "brand":
			return <SiteIcon domain={row.website} size={size} />;
		case "new-brand":
			return <IconPlus className={className} />;
		case "set-up":
			return <IconArrowRight className={className} />;
	}
}
