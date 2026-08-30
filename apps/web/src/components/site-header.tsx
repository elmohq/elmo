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
import { cn } from "@workspace/ui/lib/utils";
import { Fragment } from "react";
import { type Crumb, useBreadcrumbs } from "@/lib/breadcrumbs";

/**
 * A box rather than bare text, so the whole crumb takes the hover and the trail
 * has a height to centre against — a labelled crumb is two lines tall, and the
 * chevrons sit against its middle.
 */
// `transition-none` overrides the link's own `transition-colors`: the rail and
// the menu take their hover at once, and a crumb easing into one reads as lag.
const CRUMB = "block rounded-md px-2 py-1 leading-tight transition-none";

/**
 * An organization and a brand are often named the same thing, so each says which
 * it is. In the line rather than above it: left to size itself the label is
 * wider than a short name and runs into the crumb beside it.
 */
function CrumbLabel({ crumb }: { crumb: Crumb }) {
	if (!crumb.kind) return <>{crumb.label}</>;

	return (
		<>
			<span className="mb-0.5 block text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground/70">
				{crumb.kind}
			</span>
			{crumb.label}
		</>
	);
}

export function SiteHeader() {
	const crumbs = useBreadcrumbs();

	return (
		<header className="bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 cursor-pointer" />
				<Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
				{/* Pulled back by the box's own padding, so the trail starts where it
				    would have without one. */}
				<Breadcrumb className="-ml-2">
					<BreadcrumbList className="gap-0.5 sm:gap-1">
						{crumbs.map((crumb, index) => {
							const isLast = index === crumbs.length - 1;
							return (
								// Two routes never share a pathname, so the href is a stable key.
								<Fragment key={crumb.href}>
									{index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
									<BreadcrumbItem className={isLast ? undefined : "hidden md:block"}>
										{isLast ? (
											<BreadcrumbPage className={CRUMB}>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbPage>
										) : (
											<BreadcrumbLink
												className={cn(CRUMB, "hover:bg-accent hover:text-accent-foreground")}
												render={<Link to={crumb.href} />}
											>
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
