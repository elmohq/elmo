import type { Icon } from "@tabler/icons-react";
import { Link, type LinkProps, useLocation, useRouter } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";

export interface NavItem {
	title: string;
	/** Where the entry goes, as the router's own link props — typed, and params encoded by it. */
	link: LinkProps;
	icon?: Icon;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
	const router = useRouter();
	const { setOpenMobile } = useSidebar();
	const { pathname } = useLocation();

	const items = groups.flatMap((group) => group.items);
	// Resolved by the router, so nothing here has to know the URL shape.
	const hrefs = new Map(items.map((item) => [item, router.buildLocation(item.link).pathname]));

	// Longest match wins, so Overview doesn't light on every brand page and
	// Organization doesn't light on Team — each is a prefix of the others.
	const activeHref = items
		.map((item) => hrefs.get(item) ?? "")
		.filter((href) => pathname === href || pathname.startsWith(`${href}/`))
		.reduce<string | null>((longest, href) => (longest && longest.length >= href.length ? longest : href), null);

	return (
		<>
			{groups.map((group) => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items.map((item) => (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									render={<Link {...item.link} onClick={() => setOpenMobile(false)} />}
									tooltip={item.title}
									isActive={hrefs.get(item) === activeHref}
								>
									{item.icon && <item.icon />}
									<span>{item.title}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	);
}
