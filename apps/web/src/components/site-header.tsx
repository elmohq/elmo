import { Link } from "@tanstack/react-router";
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
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { type Crumb, useBreadcrumbs } from "@/lib/breadcrumbs";

/**
 * The line above a crumb saying what it is — an organization and a brand are
 * often named the same thing.
 *
 * Every item in the trail reserves it, empty where there is nothing to say, so
 * the names all sit on one line and the whole trail centres in the header as a
 * block. Left to size itself the label would also be wider than a short name,
 * and would run into the crumb beside it.
 */
function KindLine({ children }: { children?: ReactNode }) {
	return (
		<span className="block h-3 text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground/70">
			{children}
		</span>
	);
}

function CrumbLabel({ crumb }: { crumb: Crumb }) {
	return (
		<span className="block leading-tight">
			<KindLine>{crumb.kind}</KindLine>
			{crumb.label}
		</span>
	);
}

/**
 * The two names the trail can't get from a route: they come from the layouts
 * that resolved them, so the header renders the finished trail on first paint
 * instead of growing a crumb when a query lands.
 */
export function SiteHeader({ organizationName, brandName }: { organizationName?: string; brandName?: string } = {}) {
	const crumbs = useBreadcrumbs({ organizationName, brandName });

	return (
		<header className="bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 cursor-pointer" />
				<Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb>
					<BreadcrumbList>
						{crumbs.map((crumb, index) => {
							const isLast = index === crumbs.length - 1;
							return (
								// Two routes never share a pathname, so the href identifies the crumb.
								<Fragment key={crumb.href}>
									{index > 0 && (
										<BreadcrumbSeparator className="hidden md:block">
											<span className="block">
												<KindLine />
												<ChevronRight className="size-3.5" />
											</span>
										</BreadcrumbSeparator>
									)}
									<BreadcrumbItem className={isLast ? undefined : "hidden md:block"}>
										{isLast ? (
											<BreadcrumbPage>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbPage>
										) : (
											<BreadcrumbLink render={<Link to={crumb.href} />}>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
								</Fragment>
							);
						})}
					</BreadcrumbList>
				</Breadcrumb>
			</div>
		</header>
	);
}
