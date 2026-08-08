import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/app/$brand/$")({
	component: BrandSubpathNotFound,
});

function BrandSubpathNotFound() {
	const { brand: brandId } = Route.useParams();

	return (
		<div className="space-y-0">
			<div className="mb-4">
				<h1 className="text-3xl font-bold tracking-tight">{m.not_found_title()}</h1>
				<p className="text-muted-foreground mt-1">{m.not_found_description()}</p>
			</div>

			<div className="pt-2">
				<Button asChild variant="outline">
					<Link to="/app/$brand" params={{ brand: brandId }}>
						{m.common_go_back()}
					</Link>
				</Button>
			</div>
		</div>
	);
}
