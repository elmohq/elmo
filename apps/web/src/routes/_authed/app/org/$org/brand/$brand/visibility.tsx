/**
 * Data is fetched client-side via TanStack Query hooks in PromptsDisplay, so no
 * route loader is needed — the page renders skeletons immediately.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { PromptsDisplay } from "@/components/prompts-display";
import { coercePromptOrder, DEFAULT_PROMPT_ORDER, type PromptOrder } from "@/lib/prompt-order";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/visibility")({
	staticData: { crumb: "Visibility" },
	// This route's own search key, on top of the brand-wide filters the `$brand`
	// layout validates. The default order is omitted so it keeps a clean URL.
	validateSearch: (search: Record<string, unknown>): { order?: PromptOrder } => {
		const order = coercePromptOrder(search.order);
		return order === DEFAULT_PROMPT_ORDER ? {} : { order };
	},
	head: pageHead({ description: "Track how LLMs respond to prompts about your brand." }),
	component: VisibilityPage,
});

function VisibilityPage() {
	const { org, brand: brandParam } = Route.useParams();

	const infoContent = (
		<>
			Track how different LLMs respond to prompts related to your brand, products, and{" "}
			<Link
				to="/app/org/$org/brand/$brand/settings/competitors"
				params={{ org, brand: brandParam }}
				className="underline"
			>
				competitors
			</Link>
			.
		</>
	);

	return (
		<PromptsDisplay
			pageTitle="Visibility"
			pageDescription="See how LLMs are evaluating prompts related to your brand."
			pageInfoContent={infoContent}
		/>
	);
}
