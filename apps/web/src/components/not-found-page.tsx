/**
 * The 404, and the only thing that still understands pre-workspace `/app/…`
 * links.
 *
 * Those links — old bookmarks, whitelabel parent dashboards this deployment
 * doesn't control — used to be caught by a compatibility redirect wired into the
 * route tree. Resolving them here instead keeps the route tree describing only
 * URLs the app actually mints, and shows the move rather than hiding it, so
 * whoever is still minting the old shape has a reason to stop.
 *
 * Anything it can't place falls back to the workspaces themselves, which is a
 * better answer to "this page doesn't exist" than a dead end.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { WorkspaceBrandList } from "@/components/workspace-brand-list";
import { getNotFoundContextFn } from "@/server/workspaces";

export function NotFoundPage() {
	const { pathname, suffix } = useLocation({
		// Only the path names the thing that moved; the query and hash are the
		// caller's and ride along to wherever it went.
		select: (location) => ({
			pathname: location.pathname,
			suffix: `${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
		}),
	});
	const { data, isLoading } = useQuery({
		queryKey: ["not-found-context", pathname],
		queryFn: () => getNotFoundContextFn({ data: { pathname } }),
		staleTime: 60_000,
		retry: false,
	});

	if (isLoading) {
		return (
			<FullPageCard title="404 Not Found" subtitle="The page you're looking for doesn't exist.">
				<div className="flex min-w-[240px] flex-col space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</FullPageCard>
		);
	}

	const suggestion = data?.suggestion ?? null;
	const workspaces = data?.workspaces ?? [];

	if (suggestion) {
		return (
			<FullPageCard
				title="This link has moved"
				subtitle={`${suggestion.name} lives at a new address — the workspace is now part of the URL.`}
			>
				<div className="flex min-w-[240px] flex-col space-y-3">
					{/* A plain anchor: the target is a concrete resolved path, not a
					    route pattern the router should try to fill params for. */}
					<a href={`${suggestion.href}${suffix}`} className={buttonVariants()}>
						Go to {suggestion.name}
					</a>
					<p className="text-center text-xs text-muted-foreground">
						Update any bookmarks or integrations pointing at the old address.
					</p>
				</div>
			</FullPageCard>
		);
	}

	if (workspaces.length === 0) {
		return (
			<FullPageCard title="404 Not Found" subtitle="The page you're looking for doesn't exist." showBackButton={true} />
		);
	}

	return (
		<FullPageCard title="404 Not Found" subtitle="That page doesn't exist. Here's everything you can reach.">
			<div className="flex min-w-[280px] flex-col gap-6">
				{workspaces.map((workspace) => (
					<div key={workspace.id} className="space-y-2">
						<Link to="/app/org/$org" params={orgParams(workspace)} className="font-medium hover:underline">
							{workspace.name}
						</Link>
						<div className="flex flex-col space-y-2">
							<WorkspaceBrandList workspace={workspace} />
						</div>
					</div>
				))}
			</div>
		</FullPageCard>
	);
}
