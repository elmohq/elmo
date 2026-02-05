"use client";

import { useMemo, useRef } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Button } from "@workspace/ui/components/button";
import { Inbox } from "lucide-react";
import { IconEditCircle } from "@tabler/icons-react";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBatchChartData } from "@/hooks/use-batch-chart-data";
import { useFilteredVisibility } from "@/hooks/use-filtered-visibility";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";
import { VirtualizedPromptList } from "@/components/virtualized-prompt-list";
import { ChartDataProvider } from "@/contexts/chart-data-context";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageHeader, usePageFilters, usePageFilterSetters, type ModelType } from "@/components/page-header";
import type { Brand, Competitor } from "@workspace/lib/db/schema";

interface Prompt {
	id: string;
	brandId: string;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface PromptsDisplayProps {
	prompts: Prompt[];
	pageTitle: string;
	pageDescription: string;
	pageInfoContent?: React.ReactNode;
	editLink: string;
	excludeModels?: ModelType[];
}

// Loading skeleton for the content area — matches real chart card structure
function ContentLoadingSkeleton() {
	return (
		<div className="space-y-6">
			{[...Array(3)].map((_, i) => (
				<Card key={i} className="py-3 gap-3">
					<CardHeader className="flex justify-between items-center px-3">
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-5 w-24 rounded-full" />
					</CardHeader>
					<Separator className="py-0 my-0" />
					<CardContent className="pl-0 pr-6">
						<div className="h-[250px] flex items-center justify-center">
							<div className="space-y-2">
								<Skeleton className="h-4 w-32 mx-auto" />
								<div className="flex justify-center space-x-2">
									<div className="h-2 w-2 bg-primary/20 rounded-full animate-pulse" />
									<div className="h-2 w-2 bg-primary/20 rounded-full animate-pulse [animation-delay:0.2s]" />
									<div className="h-2 w-2 bg-primary/20 rounded-full animate-pulse [animation-delay:0.4s]" />
								</div>
							</div>
						</div>
					</CardContent>
					<Separator className="py-0 my-0" />
					<CardFooter className="flex items-center justify-between px-3 pt-3 pb-0">
						<div className="flex items-center gap-2">
							<Skeleton className="h-6 w-16 rounded" />
							<Skeleton className="h-6 w-24 rounded" />
						</div>
						<Skeleton className="h-6 w-20 rounded" />
					</CardFooter>
				</Card>
			))}
		</div>
	);
}

export function PromptsDisplay({
	prompts,
	pageTitle,
	pageDescription,
	pageInfoContent,
	editLink,
	excludeModels = [],
}: PromptsDisplayProps) {
	const { brand } = useBrand();
	const { selectedModel, selectedLookback, selectedTags, searchQuery } = usePageFilters();
	const { clearFilters } = usePageFilterSetters();

	// Filter available models based on excludeModels prop
	const availableIndividualModels: ("openai" | "anthropic" | "google")[] = (
		["openai", "anthropic", "google"] as const
	).filter((model) => !excludeModels.includes(model));

	// Add "all" option if there are multiple models available
	const availableModels: ModelType[] =
		availableIndividualModels.length > 1 ? ["all", ...availableIndividualModels] : availableIndividualModels;

	// Use the new optimized summary hook instead of fetching all prompt runs
	const modelGroupParam = selectedModel === "all" ? undefined : selectedModel;
	const {
		promptsSummary,
		isLoading: isLoadingSummary,
		isError: summaryError,
	} = usePromptsSummary(brand?.id, {
		lookback: selectedLookback,
		modelGroup: modelGroupParam,
		tags: selectedTags.length > 0 ? selectedTags : undefined,
	});

	// Compute filtered prompts (after tag filter from API + local text search)
	const { sortedPrompts, availableTags } = useMemo(() => {
		if (!promptsSummary) {
			return { sortedPrompts: [], availableTags: [] };
		}
		const { prompts: allPrompts, availableTags = [] } = promptsSummary;
		const filtered = searchQuery
			? allPrompts.filter((p) => p.value.toLowerCase().includes(searchQuery.toLowerCase()))
			: allPrompts;
		return { sortedPrompts: filtered, availableTags };
	}, [promptsSummary, searchQuery]);

	// Get prompt IDs for batch data fetching
	const filteredPromptIds = useMemo(() => {
		return sortedPrompts.map(p => p.id);
	}, [sortedPrompts]);

	// Fetch visibility data for header bar (using original endpoint with citations)
	const {
		filteredVisibility,
		isLoading: isLoadingVisibility,
	} = useFilteredVisibility(brand?.id, {
		lookback: selectedLookback,
		promptIds: filteredPromptIds.length > 0 ? filteredPromptIds : undefined,
		modelGroup: modelGroupParam,
	});

	// Cache the last valid visibility data so it never flashes back to skeleton
	// during SWR key transitions (e.g. when promptIds change)
	const lastVisibilityRef = useRef(filteredVisibility);
	if (filteredVisibility) {
		lastVisibilityRef.current = filteredVisibility;
	}
	const stableVisibilityData = filteredVisibility || lastVisibilityRef.current;



	// Fetch ALL chart data in a single batch request (instead of N individual requests)
	const {
		batchChartData,
		isLoading: isLoadingChartData,
	} = useBatchChartData(brand?.id, {
		lookback: selectedLookback,
		modelGroup: modelGroupParam,
		promptIds: filteredPromptIds,
	});

	// Calculate date range for chart data provider
	const { startDate, endDate } = useMemo(() => {
		if (!batchChartData?.dateRange) {
			const now = new Date();
			return { startDate: now, endDate: now };
		}
		return {
			startDate: new Date(batchChartData.dateRange.fromDate),
			endDate: new Date(batchChartData.dateRange.toDate),
		};
	}, [batchChartData?.dateRange]);

	// Whether we're still waiting for the initial summary load
	const isInitialLoad = isLoadingSummary && !promptsSummary;

	// Check if we have NO prompts at all (not just filtered results)
	const hasNoPromptsAtAll = !isInitialLoad && (promptsSummary?.prompts?.length ?? 0) === 0 && selectedTags.length === 0 && !searchQuery;

	// Convert batch data to Brand/Competitor types for the provider
	const brandForProvider: Brand | null = batchChartData?.brand ? {
		id: batchChartData.brand.id,
		name: batchChartData.brand.name,
		website: "",
		enabled: true,
		onboarded: true,
		delayOverrideHours: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} : null;

	const competitorsForProvider: Competitor[] = batchChartData?.competitors?.map(c => ({
		id: c.id,
		name: c.name,
		brandId: brand?.id || "",
		domain: "",
		createdAt: new Date(),
		updatedAt: new Date(),
	})) || [];

	// Determine what to render as content
	let content: React.ReactNode;
	if (isInitialLoad) {
		// Initial load — real header renders immediately, only chart area shows skeletons
		content = <ContentLoadingSkeleton />;
	} else if (summaryError) {
		content = (
			<Card className="p-6">
				<div className="text-center text-muted-foreground">
					<p className="mb-2">Failed to load prompts data</p>
					<p className="text-sm">Try refreshing the page</p>
				</div>
			</Card>
		);
	} else if (hasNoPromptsAtAll) {
		// No prompts at all - show empty state with add button
		content = (
			<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
				<div className="text-center py-8 text-muted-foreground">
					<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
					<p className="mb-4">No prompts yet.</p>
					<Button asChild size="sm" className="h-7 flex cursor-pointer">
						<Link href={editLink}>
							<IconEditCircle />
							<span>Edit</span>
						</Link>
					</Button>
				</div>
			</div>
		);
	} else if (sortedPrompts.length === 0) {
		// Prompts exist but filters returned no results
		content = (
			<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
				<div className="text-center py-8 text-muted-foreground">
					<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
					<p className="mb-2">No prompts match your filters.</p>
					<p className="text-sm mb-4">Try adjusting your search or tag filters.</p>
					<Button
						variant="outline"
						size="sm"
						onClick={clearFilters}
						className="cursor-pointer"
					>
						Clear filters
					</Button>
				</div>
			</div>
		);
	} else {
		content = (
			<ChartDataProvider
				batchData={batchChartData?.chartData || null}
				brand={brandForProvider}
				competitors={competitorsForProvider}
				startDate={startDate}
				endDate={endDate}
				isLoading={isLoadingChartData}
			>
				<VirtualizedPromptList
					prompts={sortedPrompts}
					brandId={brand?.id || ""}
					lookback={selectedLookback}
					selectedModel={selectedModel}
					availableModels={availableIndividualModels}
					searchHighlight={searchQuery}
				/>
			</ChartDataProvider>
		);
	}

	return (
		<PageHeader
			title={pageTitle}
			subtitle={pageDescription}
			infoContent={pageInfoContent}
			availableTags={availableTags}
			editTagsLink={editLink}
			showSearch
			showModelSelector
			showVisibilityBar
			availableModels={availableModels}
			resultCount={isInitialLoad ? undefined : sortedPrompts.length}
			visibilityData={stableVisibilityData}
			isLoadingVisibility={!stableVisibilityData}
		>
			{content}
		</PageHeader>
	);
}
