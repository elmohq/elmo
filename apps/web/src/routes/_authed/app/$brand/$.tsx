import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/$brand/$")({
	component: BrandSubpathNotFound,
});

function BrandSubpathNotFound() {
	const { brand: brandId } = Route.useParams();

	return (
		<div className="flex flex-col items-center justify-center py-16">
			<div className="text-center max-w-lg">
				<h1 className="text-2xl font-semibold tracking-tight">404 Not Found</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					The page you’re looking for doesn’t exist, but you still have access to this brand.
				</p>
				<div className="mt-6 flex items-center justify-center gap-2">
					<Button asChild variant="secondary">
						<Link to="/app/$brand" params={{ brand: brandId }}>
							Go to Overview
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link to="/app/$brand/settings/brand" params={{ brand: brandId }}>
							Brand settings
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

