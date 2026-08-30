import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CitationsDisplay } from "@/components/citations-display";
import { ALL_MODELS_VALUE } from "@/components/filter-bar";
import { FilteredListShell } from "@/components/filtered-list-shell";
import { PageHeader } from "@/components/page-header";
import { brandKeys, useBrand } from "@/hooks/use-brands";
import { useCitations } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { useListFilters } from "@/hooks/use-list-filters";
import { useBrandParams } from "@/hooks/use-route-params";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/citations")({
	staticData: { crumb: "Citations" },
	head: pageHead({ description: "See which sources LLMs cite in responses to your prompts." }),
	component: CitationsPage,
});

function CitationsPage() {
	const brandParams = useBrandParams();
	const { brandId } = Route.useRouteContext();
	const queryClient = useQueryClient();

	const filters = useListFilters();
	const days = getDaysFromLookback(filters.lookback);

	const { brand } = useBrand(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];

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
			<p className="mb-2">
				Citations are the links and sources that AI models include in their responses when answering your prompts. They
				show which websites the AI considers authoritative or relevant to your topics.
			</p>
			<p>
				<strong>Competitor</strong> domains are only those you&apos;ve added to your{" "}
				<Link to="/app/org/$org/brand/$brand/settings/competitors" params={brandParams} className="underline">
					tracked competitors list
				</Link>
				. Other domains appear under their detected category (Google, Social Media, Institutional, or Other).
			</p>
		</>
	);

	const showFullSkeleton = isLoading && !citationData;

	return (
		<PageHeader
			title="Citations"
			subtitle="See which sources LLMs cite when responding to your prompts."
			infoContent={infoContent}
		>
			<FilteredListShell
				filters={filters}
				availableTags={citationData?.availableTags || []}
				trackedTargets={trackedTargets}
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
								Failed to load citation data. Please try again.
							</div>
						</CardContent>
					</Card>
				}
				totalCount={citationData?.totalCitations}
				noMatchesTitle="No citations found for the selected filters."
				noMatchesDescription="Try adjusting your filters or time period."
				emptyState={
					<Card>
						<CardContent className="pt-6">
							<div className="text-muted-foreground text-center py-8">
								No citations found. Citations are only available from prompts evaluated with web search enabled.
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
