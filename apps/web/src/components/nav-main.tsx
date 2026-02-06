"use client";

import { type Icon } from "@tabler/icons-react";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import Link from "next/link";
import { useBrand } from "@/hooks/use-brands";
import { usePathname } from "next/navigation";

export interface NavItem {
	title: string;
	url: string;
	icon?: Icon;
	absolute?: boolean;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
	// Use brandId (from URL) instead of brand?.id to avoid undefined during loading
	const { brandId } = useBrand();
	const { setOpenMobile } = useSidebar();
	const pathname = usePathname();

	const getHref = (url: string, absolute?: boolean) => {
		return absolute ? url : `/app/${brandId}${url}`;
	};

	const isActive = (url: string, absolute?: boolean) => {
		const href = getHref(url, absolute);
		// Exact match for root dashboard
		if (href === `/app/${brandId}` || href === `/app/${brandId}/`) {
			return pathname === `/app/${brandId}` || pathname === `/app/${brandId}/`;
		}
		return pathname.startsWith(href);
	};

	return (
		<>
			{groups.map((group) => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items.map((item) => (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									asChild
									tooltip={item.title}
									isActive={isActive(item.url, item.absolute)}
								>
									<Link
										href={getHref(item.url, item.absolute)}
										onClick={() => setOpenMobile(false)}
									>
										{item.icon && <item.icon />}
										<span>{item.title}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	);
}
