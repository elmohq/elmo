import type { Icon } from "@tabler/icons-react";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";

/**
 * What a nav entry's `url` is relative to. One field with three values rather
 * than two independent booleans, so "workspace-relative *and* absolute" isn't a
 * state the type allows and `href` is a switch instead of a precedence rule.
 */
export type NavBase = "brand" | "workspace" | "absolute";

export interface NavItem {
	title: string;
	/** Relative to `base`; "/" means that section's own root. */
	url: string;
	icon?: Icon;
	base?: NavBase;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
	const params = useParams({ strict: false }) as { org?: string; brand?: string };
	const { setOpenMobile } = useSidebar();
	const { pathname } = useLocation();

	// Built from the segments already in the address bar rather than from ids, so
	// a link never bounces through the canonicalizing redirect on its way.
	const getHref = (item: NavItem) => {
		// "/" means the section's own root, which is the prefix with nothing added.
		const suffix = item.url === "/" ? "" : item.url;
		switch (item.base ?? "brand") {
			case "absolute":
				return item.url;
			case "workspace":
				return `/app/org/${params.org}${suffix}`;
			case "brand":
				return `/app/org/${params.org}/brand/${params.brand}${suffix}`;
		}
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
