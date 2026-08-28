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

	// Each entry carries where it leads, resolved by the router so nothing here
	// has to know the URL shape. Two entries can share a title — an organization's
	// Brands and admin's — so the href is what identifies one.
	const resolved = groups.map((group) => ({
		label: group.label,
		items: group.items.map((item) => ({ item, href: router.buildLocation(item.link).pathname })),
	}));

	// Longest match wins, so Overview doesn't light on every brand page and
	// Organization doesn't light on Team — each is a prefix of the others.
	let activeHref = "";
	for (const group of resolved) {
		for (const { href } of group.items) {
			const onIt = pathname === href || pathname.startsWith(`${href}/`);
			if (onIt && href.length > activeHref.length) activeHref = href;
		}
	}

	return (
		<>
			{resolved.map((group) => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items.map(({ item, href }) => (
							<SidebarMenuItem key={href}>
								<SidebarMenuButton
									render={<Link {...item.link} onClick={() => setOpenMobile(false)} />}
									tooltip={item.title}
									isActive={href === activeHref}
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
