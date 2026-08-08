/**
 * /app/$brand/citations - Citations tracking page
 *
 * Shows citation statistics with filtering by model, tags, and lookback period.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useCitations } from "@/hooks/use-citations";
import { useBrand, brandKeys } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { CitationsDisplay } from "@/components/citations-display";
import { FilteredListShell } from "@/components/filtered-list-shell";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { PageHeader } from "@/components/page-header";
import { getAvailableModels, ALL_MODELS_VALUE } from "@/components/filter-bar";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/app/$brand/citations")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.page_citations_title(), { appName, brandName }) },
				{ name: "description", content: m.page_citations_meta_description() },
			],
		};
	},
	component: CitationsPage,
});

function CitationsPage() {
	const { brand: brandId } = Route.useParams();
	const queryClient = useQueryClient();

	const filters = useListFilters();
	const days = getDaysFromLookback(filters.lookback);

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);

	// Get citation data with tag and model filter
	const modelParam = filters.model === ALL_MODELS_VALUE ? undefined : filters.model;
	const {
		citations: citationData,
		isLoading,
		isError,
		revalidate: revalidateCitations,
	} = useCitations(brandId, {
		days,
		tags: filters.tags.length > 0 ? filters.tags : undefined,
		model: modelParam,
	});

	const infoContent = (
		<>
			<p className="mb-2">{m.page_citations_info()}</p>
			<p>
				{m.page_citations_competitor_prefix()} {" "}
				<Link to="/app/$brand/settings/competitors" params={{ brand: brandId }} className="underline">
					{m.page_citations_competitor_link()}
				</Link>
				. {m.page_citations_competitor_suffix()}
			</p>
		</>
	);

	const showFullSkeleton = isLoading && !citationData;

	return (
		<PageHeader
			title={m.page_citations_title()}
			subtitle={m.page_citations_description()}
			infoContent={infoContent}
		>
			<FilteredListShell
				filters={filters}
				availableTags={citationData?.availableTags || []}
				availableModels={availableModels}
				showModelSelector
				isLoading={showFullSkeleton}
				loadingState={
					<Card>
						<CardHeader>
							<Skeleton className="h-6 w-48" />
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-4 w-1/2" />
								<Skeleton className="h-4 w-2/3" />
							</div>
						</CardContent>
					</Card>
				}
				isError={Boolean(isError) || !citationData}
				errorState={
					<Card>
						<CardContent className="pt-6">
							<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
								{m.citations_load_error()}
							</div>
						</CardContent>
					</Card>
				}
				totalCount={citationData?.totalCitations}
				noMatchesTitle={m.citations_no_matches()}
				noMatchesDescription={m.citations_adjust_filters()}
				emptyState={
					<Card>
						<CardContent className="pt-6">
							<div className="text-muted-foreground text-center py-8">
								{m.citations_empty()}
							</div>
						</CardContent>
					</Card>
				}
			>
				{citationData && (
					<CitationsDisplay
						citationData={citationData}
						brandId={brandId}
						brandName={brand?.name}
						showStats={true}
						maxDomains={10}
						maxUrls={20}
						days={days}
						onCompetitorAdded={() => {
							revalidateCitations();
							queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
							queryClient.invalidateQueries({ queryKey: brandKeys.competitors(brandId) });
							queryClient.invalidateQueries({ queryKey: brandKeys.detail(brandId) });
						}}
					/>
				)}
			</FilteredListShell>
		</PageHeader>
	);
}
