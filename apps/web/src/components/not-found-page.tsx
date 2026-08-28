/**
 * Offers the same directory `/app` does, since "somewhere else" is the only
 * useful answer to a page that isn't there. Reachable without a session, so it
 * has to render with nothing in it too.
 */
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { listReachableOrganizationsFn } from "@/server/organizations";

const TITLE = "404 Not Found";

export function NotFoundPage() {
	const { data, isLoading } = useQuery({
		queryKey: ["reachable-organizations"],
		queryFn: () => listReachableOrganizationsFn(),
		staleTime: 60_000,
		retry: false,
	});

	if (isLoading) {
		return (
			<FullPageCard title={TITLE} subtitle="That page doesn't exist or moved.">
				<div className="flex min-w-[240px] flex-col space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</FullPageCard>
		);
	}

	const organizations = data ?? [];

	if (organizations.length === 0) {
		return <FullPageCard title={TITLE} subtitle="That page doesn't exist or moved." showBackButton={true} />;
	}

	return (
		<FullPageCard title={TITLE} subtitle="That page doesn't exist or moved.">
			<OrganizationDirectory organizations={organizations} />
		</FullPageCard>
	);
}
