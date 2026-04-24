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
import { Button } from "@workspace/ui/components/button";
import { useCitations } from "@/hooks/use-citations";
import { useBrand, brandKeys } from "@/hooks/use-brands";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { CitationsDisplay } from "@/components/citations-display";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, getAvailableModels, usePageFilters, usePageFilterSetters } from "@/components/filter-bar";


export const Route = createFileRoute("/_authed/app/$brand/citations")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Citations", { appName, brandName }) },
				{ name: "description", content: "See which sources LLMs cite in responses to your prompts." },
			],
		};
	},
	component: CitationsPage,
});

function CitationsPage() {
	const { brand: brandId } = Route.useParams();
	const queryClient = useQueryClient();

	const { selectedModel, selectedLookback, selectedTags } = usePageFilters();
	const { clearFilters } = usePageFilterSetters();
	const days = getDaysFromLookback(selectedLookback);

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);

	// Get citation data with tag and model filter
	const modelParam = selectedModel === "all" ? undefined : selectedModel;
	const {
		citations: citationData,
		isLoading,
		isError,
		revalidate: revalidateCitations,
	} = useCitations(brandId, {
		days,
		tags: selectedTags.length > 0 ? selectedTags : undefined,
		model: modelParam,
	});

	const availableTags = citationData?.availableTags || [];

	const infoContent = (
		<>
			<p className="mb-2">
				Citations are the links and sources that AI models include in their responses when answering your prompts. They show which websites the AI considers authoritative or relevant to your topics.
			</p>
			<p>
				<strong>Competitor</strong> domains are only those you&apos;ve added to your{" "}
				<Link to="/app/$brand/settings/competitors" params={{ brand: brandId }} className="underline">
					tracked competitors list
				</Link>
				. Other domains appear under their detected category (Google, Social Media, Institutional, or Other).
			</p>
		</>
	);

	const showFullSkeleton = isLoading && !citationData;
	let content: React.ReactNode;
	if (showFullSkeleton) {
		content = (
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
		);
	} else if (isError || !citationData) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
						Failed to load citation data. Please try again.
					</div>
				</CardContent>
			</Card>
		);
	} else if (citationData.totalCitations === 0) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-muted-foreground text-center py-8">
						{selectedTags.length > 0 || selectedModel !== "all" ? (
							<>
								<p className="mb-2">No citations found for the selected filters.</p>
								<p className="text-sm mb-4">Try adjusting your filters or time period.</p>
								<Button variant="outline" size="sm" onClick={clearFilters} className="cursor-pointer">
									Clear filters
								</Button>
							</>
						) : (
							"No citations found. Citations are only available from prompts evaluated with web search enabled."
						)}
					</div>
				</CardContent>
			</Card>
		);
	} else {
		content = (
			<CitationsDisplay
				citationData={citationData}
				brandId={brandId}
				brandName={brand?.name}
				showStats={true}
				maxDomains={20}
				maxUrls={20}
				days={days}
				onCompetitorAdded={() => {
					revalidateCitations();
					queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
					queryClient.invalidateQueries({ queryKey: brandKeys.competitors(brandId) });
					queryClient.invalidateQueries({ queryKey: brandKeys.detail(brandId) });
				}}
			/>
		);
	}

	return (
		<PageHeader
			title="Citations"
			subtitle="See which sources LLMs cite when responding to your prompts."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar
					availableTags={availableTags}
					availableModels={availableModels}
					showSearch={false}
					showModelSelector
				/>
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}
