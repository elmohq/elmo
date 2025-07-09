"use client";

import { type Icon } from "@tabler/icons-react";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { useBrand } from "@/hooks/use-brands";

export function NavMain({
	items,
}: {
	items: {
		title: string;
		url: string;
		icon?: Icon;
	}[];
}) {
    const { brand } = useBrand();
    
	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarGroupLabel className="sr-only">Pages</SidebarGroupLabel>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton tooltip={item.title} className="cursor-pointer" asChild>
								<Link href={`/app/${brand?.id}${item.url}`}>
                                    {item.icon && <item.icon />}
                                    <span>{item.title}</span>
                                </Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
