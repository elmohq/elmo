import { useMemo } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Button } from "@workspace/ui/components/button";
import { Inbox } from "lucide-react";
import { IconEditCircle } from "@tabler/icons-react";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBatchChartData } from "@/hooks/use-batch-chart-data";
import { useBrand } from "@/hooks/use-brands";
import { Link } from "@tanstack/react-router";
import { VirtualizedPromptList } from "@/components/virtualized-prompt-list";
import { ChartDataProvider } from "@/contexts/chart-data-context";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageHeader, StickyFilterSection } from "@/components/page-header";
import {
	FilterBar,
	getAvailableModelsForBrand,
	usePageFilters,
	usePageFilterSetters,
} from "@/components/filter-bar";
import { VisibilityBarSection } from "@/components/visibility-bar-section";
import type { Brand, Competitor } from "@workspace/lib/db/schema";

interface PromptsDisplayProps {
	pageTitle: string;
	pageDescription: string;
	pageInfoContent?: React.ReactNode;
	editLink: string;
}

/** Host component: renders the page shell (title, sticky bar, content)
 *  and composes independent sub-sections. It doesn't subscribe to any
 *  filter state itself — each section reads the URL keys it cares about
 *  so a filter change only re-renders the sections that depend on it. */
export function PromptsDisplay({ pageTitle, pageDescription, pageInfoContent, editLink }: PromptsDisplayProps) {
	const { brand } = useBrand();
	return (
		<PageHeader title={pageTitle} subtitle={pageDescription} infoContent={pageInfoContent}>
			<PromptsContent brandId={brand?.id} editLink={editLink} />
		</PageHeader>
	);
}

/** Owns the single `usePromptsSummary` subscription for the page. Derives
 *  `availableTags`, the search-filtered prompt id list (used by both the
 *  visibility bar and the chart list), and passes them down. Child
 *  components still hold their own subscriptions to whichever URL keys
 *  they need, so a click on "Lookback" only invalidates the data users
 *  and not `FilterBar` itself. */
function PromptsContent({ brandId, editLink }: { brandId: string | undefined; editLink: string }) {
	const { brand } = useBrand(brandId);
	const { selectedModel, selectedLookback, selectedTags, searchQuery } = usePageFilters();
	const { clearFilters } = usePageFilterSetters();

	const availableModels = useMemo(
		() => getAvailableModelsForBrand(brand?.enabledModels),
		[brand?.enabledModels],
	);
	const availableIndividualModels = useMemo(
		() => availableModels.filter((m): m is "chatgpt" | "claude" | "google-ai-mode" => m !== "all"),
		[availableModels],
	);

	const modelParam = selectedModel === "all" ? undefined : selectedModel;
	const {
		promptsSummary,
		isLoading: isLoadingSummary,
		isError: summaryError,
	} = usePromptsSummary(brandId, {
		lookback: selectedLookback,
		model: modelParam,
		tags: selectedTags.length > 0 ? selectedTags : undefined,
	});

	const availableTags = promptsSummary?.availableTags ?? [];

	const { sortedPrompts, filteredPromptIds } = useMemo(() => {
		if (!promptsSummary) return { sortedPrompts: [], filteredPromptIds: [] as string[] };
		const allPrompts = promptsSummary.prompts;
		const filtered = searchQuery
			? allPrompts.filter((p: { value: string }) => p.value.toLowerCase().includes(searchQuery.toLowerCase()))
			: allPrompts;
		return {
			sortedPrompts: filtered,
			filteredPromptIds: filtered.map((p: { id: string }) => p.id),
		};
	}, [promptsSummary, searchQuery]);

	const isInitialLoad = isLoadingSummary && !promptsSummary;
	const hasNoPromptsAtAll =
		!isInitialLoad &&
		(promptsSummary?.prompts?.length ?? 0) === 0 &&
		selectedTags.length === 0 &&
		!searchQuery;

	return (
		<>
			<StickyFilterSection>
				<FilterBar
					availableTags={availableTags}
					availableModels={availableModels}
					showSearch
					showModelSelector
					resultCount={isInitialLoad ? undefined : sortedPrompts.length}
				/>
				<VisibilityBarSection brandId={brandId} promptIds={filteredPromptIds} />
			</StickyFilterSection>

			<div className="space-y-6">
				{isInitialLoad ? (
					<ContentLoadingSkeleton />
				) : summaryError ? (
					<Card className="p-6">
						<div className="text-center text-muted-foreground">
							<p className="mb-2">Failed to load prompts data</p>
							<p className="text-sm">Try refreshing the page</p>
						</div>
					</Card>
				) : hasNoPromptsAtAll ? (
					<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
						<div className="text-center py-8 text-muted-foreground">
							<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
							<p className="mb-4">No prompts yet.</p>
							<Button asChild size="sm" className="h-7 flex cursor-pointer">
								<Link to={editLink}>
									<IconEditCircle />
									<span>Edit</span>
								</Link>
							</Button>
						</div>
					</div>
				) : sortedPrompts.length === 0 ? (
					<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
						<div className="text-center py-8 text-muted-foreground">
							<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
							<p className="mb-2">No prompts match your filters.</p>
							<p className="text-sm mb-4">Try adjusting your search or tag filters.</p>
							<Button variant="outline" size="sm" onClick={clearFilters} className="cursor-pointer">
								Clear filters
							</Button>
						</div>
					</div>
				) : (
					<ChartSection
						brandId={brandId}
						lookback={selectedLookback}
						selectedModel={selectedModel}
						modelParam={modelParam}
						searchQuery={searchQuery}
						sortedPrompts={sortedPrompts}
						filteredPromptIds={filteredPromptIds}
						availableIndividualModels={availableIndividualModels}
					/>
				)}
			</div>
		</>
	);
}

/** Heavy chart subtree. Split out so it gets its own render boundary —
 *  `React.memo` on `VirtualizedPromptList` means this block only walks
 *  30 chart cards when its own props change, not every time a sibling
 *  state (like visibility refetch) moves. */
function ChartSection({
	brandId,
	lookback,
	selectedModel,
	modelParam,
	searchQuery,
	sortedPrompts,
	filteredPromptIds,
	availableIndividualModels,
}: {
	brandId: string | undefined;
	lookback: ReturnType<typeof usePageFilters>["selectedLookback"];
	selectedModel: ReturnType<typeof usePageFilters>["selectedModel"];
	modelParam: string | undefined;
	searchQuery: string;
	sortedPrompts: { id: string; value: string; firstEvaluatedAt?: Date | string | null }[];
	filteredPromptIds: string[];
	availableIndividualModels: ("chatgpt" | "claude" | "google-ai-mode")[];
}) {
	const { batchChartData, isLoading: isLoadingChartData } = useBatchChartData(brandId, {
		lookback,
		model: modelParam,
		promptIds: filteredPromptIds,
	});

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

	const brandForProvider: Brand | null = batchChartData?.brand
		? {
				id: batchChartData.brand.id,
				name: batchChartData.brand.name,
				website: "",
				additionalDomains: [],
				aliases: [],
				enabled: true,
				onboarded: true,
				delayOverrideHours: null,
				enabledModels: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			}
		: null;

	const competitorsForProvider: Competitor[] =
		batchChartData?.competitors?.map((c) => ({
			id: c.id,
			name: c.name,
			brandId: brandId || "",
			domains: [],
			aliases: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		})) || [];

	return (
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
				brandId={brandId || ""}
				lookback={lookback}
				selectedModel={selectedModel}
				availableModels={availableIndividualModels}
				searchHighlight={searchQuery}
			/>
		</ChartDataProvider>
	);
}

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
