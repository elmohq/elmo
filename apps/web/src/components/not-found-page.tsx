/**
 * Offers the same directory `/app` does, since "somewhere else" is the only
 * useful answer to a page that isn't there.
 *
 * Renders outside `_authed`, so there is no session in context: the query is
 * what says whether there is one, and null means signed out rather than signed
 * in with nothing to their name.
 */
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { organizationsQuery } from "@/lib/organizations/queries";

const TITLE = "404 Not Found";
const SUBTITLE = "That page doesn't exist or moved.";

export function NotFoundPage() {
	// One attempt: this page renders for signed-out callers too, and retrying
	// tells them nothing. Everywhere else keeps the query's own retry, which is
	// what holds a blip off `/app/org/$org`'s error boundary.
	const { data: organizations, isLoading } = useQuery({ ...organizationsQuery, retry: false });

	if (isLoading) {
		return (
			<FullPageCard title={TITLE} subtitle={SUBTITLE}>
				<div className="flex min-w-[240px] flex-col space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</FullPageCard>
		);
	}

	if (!organizations) {
		return <FullPageCard title={TITLE} subtitle={SUBTITLE} showBackButton={true} />;
	}

	// Signed in, so the mark leads back to the directory as it does everywhere
	// else, even for an account with nothing in it yet.
	return (
		<FullPageCard logoHref="/app" title={TITLE} subtitle={SUBTITLE} showBackButton={organizations.length === 0}>
			{organizations.length > 0 ? <OrganizationDirectory organizations={organizations} /> : undefined}
		</FullPageCard>
	);
}
