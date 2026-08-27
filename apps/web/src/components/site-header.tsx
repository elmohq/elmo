import { Link, useLocation } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { useBrand } from "@/hooks/use-brands";

const PAGE_NAMES: Record<string, string> = {
	visibility: "Visibility",
	"share-of-voice": "Share of Voice",
	"query-fan-out": "Query Fan-Out",
	opportunities: "Opportunities",
	prompts: "Prompts",
	citations: "Citations",
	brand: "Brand",
	competitors: "Competitors",
	llms: "LLMs",
	workflows: "Workflows",
	tools: "Tools",
};

function getPageDisplayName(segment: string): string {
	return PAGE_NAMES[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
}

function AdminBreadcrumbs({ pathname }: { pathname: string }) {
	const segments = pathname.split("/").filter(Boolean);

	if (segments[0] === "reports") {
		if (segments.length > 1) {
			return (
				<>
					<BreadcrumbItem className="hidden md:block">
						<BreadcrumbLink render={<Link to="/reports" />}>Reports</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator className="hidden md:block" />
					<BreadcrumbItem>
						<BreadcrumbPage>View Report</BreadcrumbPage>
					</BreadcrumbItem>
				</>
			);
		}
		return (
			<>
				<BreadcrumbItem className="hidden md:block">
					<span className="text-muted-foreground">Admin</span>
				</BreadcrumbItem>
				<BreadcrumbSeparator className="hidden md:block" />
				<BreadcrumbItem>
					<BreadcrumbPage>Reports</BreadcrumbPage>
				</BreadcrumbItem>
			</>
		);
	}

	if (segments.length === 1) {
		return (
			<>
				<BreadcrumbItem className="hidden md:block">
					<span className="text-muted-foreground">Admin</span>
				</BreadcrumbItem>
				<BreadcrumbSeparator className="hidden md:block" />
				<BreadcrumbItem>
					<BreadcrumbPage>Brands</BreadcrumbPage>
				</BreadcrumbItem>
			</>
		);
	}

	const subPage = segments[1];
	return (
		<>
			<BreadcrumbItem className="hidden md:block">
				<span className="text-muted-foreground">Admin</span>
			</BreadcrumbItem>
			<BreadcrumbSeparator className="hidden md:block" />
			<BreadcrumbItem>
				<BreadcrumbPage>{getPageDisplayName(subPage)}</BreadcrumbPage>
			</BreadcrumbItem>
		</>
	);
}

function BrandBreadcrumbs({
	pathname,
	brandId,
	brandName,
}: {
	pathname: string;
	brandId: string | undefined;
	brandName: string;
}) {
	const pathSegments = pathname.split("/");
	const brandIndex = pathSegments.findIndex((segment) => segment === "app");
	const pageSegment = brandIndex >= 0 && pathSegments[brandIndex + 2] ? pathSegments[brandIndex + 2] : "";
	const subSegment = brandIndex >= 0 && pathSegments[brandIndex + 3] ? pathSegments[brandIndex + 3] : "";

	const isPromptDetailPage =
		pageSegment === "prompts" &&
		subSegment &&
		subSegment !== "edit" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subSegment);

	const isEditPage = pathname.endsWith("/edit");

	const isSettingsSubPage = pageSegment === "settings" && subSegment;

	const pageName = pageSegment ? getPageDisplayName(pageSegment) : "Overview";

	return (
		<>
			<BreadcrumbItem className="hidden md:block">
				<BreadcrumbLink render={brandId ? <Link to="/app/$brand" params={{ brand: brandId }} /> : <span />}>
					{brandName}
				</BreadcrumbLink>
			</BreadcrumbItem>
			<BreadcrumbSeparator className="hidden md:block" />
			{isPromptDetailPage ? (
				<>
					<BreadcrumbItem className="hidden md:block">
						<BreadcrumbLink
							render={brandId ? <Link to="/app/$brand/visibility" params={{ brand: brandId }} /> : <span />}
						>
							Visibility
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator className="hidden md:block" />
					<BreadcrumbItem>
						<BreadcrumbPage>Prompt History</BreadcrumbPage>
					</BreadcrumbItem>
				</>
			) : isSettingsSubPage ? (
				<>
					<BreadcrumbItem className="hidden md:block">
						<span className="text-muted-foreground">Settings</span>
					</BreadcrumbItem>
					<BreadcrumbSeparator className="hidden md:block" />
					<BreadcrumbItem>
						<BreadcrumbPage>{getPageDisplayName(subSegment)}</BreadcrumbPage>
					</BreadcrumbItem>
				</>
			) : isEditPage ? (
				<>
					<BreadcrumbItem className="hidden md:block">
						<BreadcrumbLink render={<Link to={pathname.slice(0, -5)} />}>{pageName}</BreadcrumbLink>
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
		</>
	);
}

/**
 * `title` names a page that sits outside the brand and admin trees, where there
 * is no trail to derive — the breadcrumb becomes that one label.
 */
export function SiteHeader({ title }: { title?: string } = {}) {
	const { brandId, brand } = useBrand();
	const { pathname } = useLocation();

	const isAdminPage = pathname.startsWith("/admin") || pathname.startsWith("/reports");

	return (
		<header className="bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 cursor-pointer" />
				<Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb>
					<BreadcrumbList>
						{title ? (
							<BreadcrumbItem>
								<BreadcrumbPage>{title}</BreadcrumbPage>
							</BreadcrumbItem>
						) : isAdminPage ? (
							<AdminBreadcrumbs pathname={pathname} />
						) : (
							<BrandBreadcrumbs pathname={pathname} brandId={brandId} brandName={brand?.name || "Dashboard"} />
						)}
					</BreadcrumbList>
				</Breadcrumb>
			</div>
		</header>
	);
}
