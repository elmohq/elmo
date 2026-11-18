import { createFileRoute, Link } from "@tanstack/react-router";
import { ALL_MODELS_VALUE } from "@workspace/config/model-filter";
import { PromptsDisplay } from "@/components/prompts-display";
import { batchChartDataQuery } from "@/hooks/use-batch-chart-data";
import { type BrandFilterSearch, coerceLookback } from "@/hooks/use-list-filters";
import { promptsSummaryQuery } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { DEFAULT_LOOKBACK } from "@/lib/lookback";
import { coercePromptOrder, DEFAULT_PROMPT_ORDER, type PromptOrder } from "@/lib/prompt-order";
import { pageHead } from "@/lib/route-head";
import { viewerTimezone } from "@/lib/viewer-timezone";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/visibility")({
	staticData: { crumb: "Visibility" },
	validateSearch: (search: Record<string, unknown>): { order?: PromptOrder } => {
		const order = coercePromptOrder(search.order);
		return order === DEFAULT_PROMPT_ORDER ? {} : { order };
	},
	loaderDeps: ({ search }: { search: BrandFilterSearch }) => ({ model: search.model, lookback: search.lookback }),
	loader: ({ context, deps }) => {
		const timezone = viewerTimezone();
		// A first-time visitor's zone is unknown on the server; the page then loads its data in the browser.
		if (!timezone) return;

		const filters = {
			lookback: coerceLookback(deps.lookback, DEFAULT_LOOKBACK),
			model: deps.model && deps.model !== ALL_MODELS_VALUE ? deps.model : undefined,
		};
		void context.queryClient.prefetchQuery(promptsSummaryQuery(context.brandId, filters, timezone));
		void context.queryClient.prefetchQuery(batchChartDataQuery(context.brandId, filters, timezone));
	},
	head: pageHead({ description: "Track how LLMs respond to prompts about your brand." }),
	component: VisibilityPage,
});

function VisibilityPage() {
	const params = useBrandParams();

	const infoContent = (
		<>
			Track how different LLMs respond to prompts related to your brand, products, and{" "}
			<Link to="/app/org/$org/brand/$brand/settings/competitors" params={params} className="underline">
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
