import { IconArrowRight, IconPlus } from "@tabler/icons-react";
import { SiteIcon } from "@/components/site-icon";
import type { OrganizationRow } from "@/lib/organizations/tree";

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
