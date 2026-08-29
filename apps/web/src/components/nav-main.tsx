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
	/**
	 * Lights only on its own page. For the two entries whose href is a prefix of
	 * every sibling's — a brand's Overview, an organization's Organization — where
	 * matching the prefix would light them on every page below.
	 */
	exact?: boolean;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

/**
 * Which entry the current path belongs to, as its href.
 *
 * Longest match wins, so a brand's Prompts doesn't lose to its Settings. An
 * `exact` entry lights only on its own page: a brand's Overview and an
 * organization's Organization are prefixes of every sibling, and matching the
 * prefix would light them on every page below.
 */
export function activeNavHref(entries: Array<{ href: string; exact?: boolean }>, pathname: string): string {
	let active = "";
	for (const { href, exact } of entries) {
		const onIt = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
		if (onIt && href.length >= active.length) active = href;
	}
	return active;
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

	const activeHref = activeNavHref(
		resolved.flatMap((group) => group.items.map(({ item, href }) => ({ href, exact: item.exact }))),
		pathname,
	);

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
