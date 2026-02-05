"use client";

import { IconChevronRight, type Icon } from "@tabler/icons-react";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import Link from "next/link";
import { useBrand } from "@/hooks/use-brands";

export function NavMain({
	items,
}: {
	items: {
		title: string;
		url: string;
		icon?: Icon;
		absolute?: boolean;
		isActive?: boolean;
		items?: {
			title: string;
			url: string;
			absolute?: boolean;
		}[];
	}[];
}) {
	// Use brandId (from URL) instead of brand?.id to avoid undefined during loading
	const { brandId } = useBrand();
	const { setOpenMobile } = useSidebar();

	const getHref = (url: string, absolute?: boolean) => {
		return absolute ? url : `/app/${brandId}${url}`;
	};

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Platform</SidebarGroupLabel>
			<SidebarMenu>
				{items.map((item) => (
					<Collapsible key={item.title} asChild defaultOpen={item.isActive}>
						<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip={item.title}>
							<Link href={getHref(item.url, item.absolute)} onClick={() => setOpenMobile(false)}>
								{item.icon && <item.icon />}
								<span>{item.title}</span>
							</Link>
						</SidebarMenuButton>
							{item.items?.length ? (
								<>
									<CollapsibleTrigger asChild>
										<SidebarMenuAction className="data-[state=open]:rotate-90">
											<IconChevronRight />
											<span className="sr-only">Toggle</span>
										</SidebarMenuAction>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<SidebarMenuSub>
											{item.items?.map((subItem) => (
												<SidebarMenuSubItem key={subItem.title}>
												<SidebarMenuSubButton asChild>
													<Link href={getHref(subItem.url, subItem.absolute)} onClick={() => setOpenMobile(false)}>
														<span>{subItem.title}</span>
													</Link>
												</SidebarMenuSubButton>
												</SidebarMenuSubItem>
											))}
										</SidebarMenuSub>
									</CollapsibleContent>
								</>
							) : null}
						</SidebarMenuItem>
					</Collapsible>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
