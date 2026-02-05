"use client";

import { IconEditCircle } from "@tabler/icons-react";
import { usePathname } from "next/navigation";

import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";

export function SiteHeader() {
	// Use brandId (from URL) for navigation links to avoid undefined during loading
	// Use brand for display data like name
	const { brandId, brand } = useBrand();
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

	return (
		<header className="bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 cursor-pointer" />
				<Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem className="hidden md:block">
							<BreadcrumbLink asChild>
								<Link href={`/app/${brandId}`}>{brand?.name || "Dashboard"}</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden md:block" />
						{isPromptDetailPage ? (
							<>
								<BreadcrumbItem className="hidden md:block">
									<BreadcrumbLink asChild>
										<Link href={`/app/${brandId}/prompts`}>Prompts</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>Prompt History</BreadcrumbPage>
								</BreadcrumbItem>
							</>
						) : isEditPage ? (
							<>
								<BreadcrumbItem className="hidden md:block">
									<BreadcrumbLink asChild>
										<Link href={getBasePath()}>{pageName}</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>Edit</BreadcrumbPage>
								</BreadcrumbItem>
							</>
						) : (
							<BreadcrumbItem>
								<BreadcrumbPage>{pageName}</BreadcrumbPage>
							</BreadcrumbItem>
						)}
					</BreadcrumbList>
				</Breadcrumb>
				<div className="ml-auto flex items-center gap-2">
					{!isEditPage && !isPromptDetailPage && (pageSegment === "prompts" || pageSegment === "reputation") && (
						<Link href={`/app/${brandId}/prompts/edit`}>
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
