import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { useBrandParams } from "@/hooks/use-route-params";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/$")({
	staticData: { crumb: "Not found" },
	component: BrandSubpathNotFound,
});

function BrandSubpathNotFound() {
	const params = useBrandParams();

	return (
		<div className="space-y-0">
			<div className="mb-4">
				<h1 className="text-3xl font-bold tracking-tight">404 Not Found</h1>
				<p className="text-muted-foreground mt-1">The page you're looking for doesn't exist.</p>
			</div>

			<div className="pt-2">
				<Link to="/app/org/$org/brand/$brand" params={params} className={buttonVariants({ variant: "outline" })}>
					Go Back
				</Link>
			</div>
		</div>
	);
}
