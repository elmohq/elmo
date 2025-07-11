"use client";

import { IconCirclePlusFilled } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";

export function SiteHeader() {
	const { brand } = useBrand();

	return (
		<header className="bg-background/90 sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<Link href={`/app/${brand?.id}`}>
					<h1 className="text-base font-medium cursor-pointer">{brand?.name || "Dashboard"}</h1>
				</Link>
				<div className="ml-auto flex items-center gap-2">
					<Button size="sm" className="hidden h-7 sm:flex">
						<IconCirclePlusFilled />
						<span>Track Prompt</span>
					</Button>
				</div>
			</div>
		</header>
	);
}
