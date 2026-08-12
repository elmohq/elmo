import { type Icon } from "@tabler/icons-react";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Link, useLocation, useParams } from "@tanstack/react-router";

export interface NavItem {
	title: string;
	/** Relative to the brand by default; see `workspace` and `absolute`. */
	url: string;
	icon?: Icon;
	/** Relative to the workspace (`/app/$org`) instead of the brand. */
	workspace?: boolean;
	absolute?: boolean;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
	const params = useParams({ strict: false }) as { org?: string; brand?: string };
	const { setOpenMobile } = useSidebar();
	const { pathname } = useLocation();

	const getHref = (item: NavItem) => {
		if (item.absolute) return item.url;
		// "/" means the section's own root, which is the prefix with nothing added.
		const suffix = item.url === "/" ? "" : item.url;
		if (item.workspace) return `/app/${params.org}${suffix}`;
		return `/app/${params.org}/${params.brand}${suffix}`;
	};

	// Exactly one entry lights up: the longest href the path is inside. Prefix
	// matching alone would light Overview on every brand page, and the
	// workspace's General entry on Team and Billing, since each is a prefix of
	// the others.
	const activeHref = groups
		.flatMap((group) => group.items.map(getHref))
		.filter((href) => pathname === href || pathname.startsWith(`${href}/`))
		.reduce<string | null>((longest, href) => (longest && longest.length >= href.length ? longest : href), null);

	return (
		<>
			{groups.map((group) => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items.map((item) => {
							const href = getHref(item);
							return (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton asChild tooltip={item.title} isActive={href === activeHref}>
										<Link to={href} onClick={() => setOpenMobile(false)}>
											{item.icon && <item.icon />}
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	);
}
