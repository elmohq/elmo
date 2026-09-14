import { IconReport, IconTable, IconTimeline, IconTool } from "@tabler/icons-react";
import type { NavItem } from "@/components/nav-main";

export function adminNavItems({
	isAdmin,
	hasReportAccess,
	reportsEnabled,
}: {
	isAdmin: boolean;
	hasReportAccess: boolean;
	reportsEnabled: boolean;
}): NavItem[] {
	const reports: NavItem = { title: /* i18n */ "Reports", link: { to: "/reports" }, icon: IconReport };

	if (!isAdmin) return hasReportAccess && reportsEnabled ? [reports] : [];

	return [
		{ title: /* i18n */ "Brands", link: { to: "/admin" }, icon: IconTable },
		...(reportsEnabled ? [reports] : []),
		{ title: /* i18n */ "Workflows", link: { to: "/admin/workflows" }, icon: IconTimeline },
		{ title: /* i18n */ "Tools", link: { to: "/admin/tools" }, icon: IconTool },
	];
}
