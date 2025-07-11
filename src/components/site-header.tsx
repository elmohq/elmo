"use client";

import { IconEditCircle } from "@tabler/icons-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";

export function SiteHeader() {
	const { brand } = useBrand();
	const pathname = usePathname();

	// Extract the page segment from the path (e.g., /app/foo/reputation -> reputation)
	const pathSegments = pathname.split('/');
	const brandIndex = pathSegments.findIndex(segment => segment === 'app');
	const pageSegment = brandIndex >= 0 && pathSegments[brandIndex + 2] 
		? pathSegments[brandIndex + 2] 
		: '';
	
	// Capitalize the page segment or default to Dashboard
	const pageName = pageSegment 
		? pageSegment.charAt(0).toUpperCase() + pageSegment.slice(1)
		: 'Dashboard';

	return (
		<header className="bg-background/90 sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<div className="flex items-center gap-2">
					<Link href={`/app/${brand?.id}`}>
						<h1 className="text-base font-medium cursor-pointer hover:underline">{brand?.name || "Dashboard"}</h1>
					</Link>
					<span className="text-base font-medium text-muted-foreground">/</span>
					<span className="text-base font-medium text-muted-foreground">{pageName}</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					{(pageSegment === 'prompts' || pageSegment === 'reputation') && (
						<Button size="sm" className="hidden h-7 sm:flex">
							<IconEditCircle />
							<span>Edit</span>
						</Button>
					)}
				</div>
			</div>
		</header>
	);
}
