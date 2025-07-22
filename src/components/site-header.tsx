"use client";

import { IconEditCircle } from "@tabler/icons-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";

export function SiteHeader() {
	const { brand } = useBrand();
	const pathname = usePathname();

	// Check if we're on an edit page
	const isEditPage = pathname.endsWith("/edit");

	// Extract the page segment from the path (e.g., /app/foo/reputation -> reputation)
	const pathSegments = pathname.split("/");
	const brandIndex = pathSegments.findIndex((segment) => segment === "app");
	const pageSegment = brandIndex >= 0 && pathSegments[brandIndex + 2] ? pathSegments[brandIndex + 2] : "";

	// Check if we're on a specific prompt detail page (e.g., /app/foo/prompts/uuid)
	const isPromptDetailPage =
		pageSegment === "prompts" &&
		pathSegments[brandIndex + 3] &&
		pathSegments[brandIndex + 3] !== "edit" &&
		// Basic UUID pattern check (8-4-4-4-12 characters)
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathSegments[brandIndex + 3]);

	// Capitalize the page segment or default to Dashboard
	const pageName = pageSegment ? pageSegment.charAt(0).toUpperCase() + pageSegment.slice(1) : "Dashboard";

	// Get the base path without /edit for linking
	const getBasePath = () => {
		return pathname.endsWith("/edit") ? pathname.slice(0, -5) : pathname;
	};

	// Create edit link - remove trailing slashes and add /edit if not already present
	const getEditLink = () => {
		const cleanPath = pathname.replace(/\/+$/, "");
		return cleanPath.endsWith("/edit") ? cleanPath : `${cleanPath}/edit`;
	};

	return (
		<header className="bg-background sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<div className="flex items-center gap-2">
					<Link href={`/app/${brand?.id}`}>
						<h1 className="text-base font-medium cursor-pointer hover:underline">{brand?.name || "Dashboard"}</h1>
					</Link>
					<span className="text-base font-medium text-muted-foreground">/</span>
					{isPromptDetailPage ? (
						<>
							<Link href={`/app/${brand?.id}/prompts`}>
								<span className="text-base font-medium cursor-pointer hover:underline">Prompts</span>
							</Link>
							<span className="text-base font-medium text-muted-foreground">/</span>
							<span className="text-base font-medium text-muted-foreground">Prompt History</span>
						</>
					) : isEditPage ? (
						<>
							<Link href={getBasePath()}>
								<span className="text-base font-medium cursor-pointer hover:underline">{pageName}</span>
							</Link>
							<span className="text-base font-medium text-muted-foreground">/</span>
							<span className="text-base font-medium text-muted-foreground">Edit</span>
						</>
					) : (
						<span className="text-base font-medium text-muted-foreground">{pageName}</span>
					)}
				</div>
				<div className="ml-auto flex items-center gap-2">
					{!isEditPage && !isPromptDetailPage && (pageSegment === "prompts" || pageSegment === "reputation") && (
						<Link href={`/app/${brand?.id}/prompts/edit`}>
							<Button size="sm" className="hidden h-7 sm:flex cursor-pointer">
								<IconEditCircle />
								<span>Edit</span>
							</Button>
						</Link>
					)}
				</div>
			</div>
		</header>
	);
}
