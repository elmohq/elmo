import { IconEditCircle } from "@tabler/icons-react";
import { Link, useSearch } from "@tanstack/react-router";
import type { Competitor } from "@workspace/lib/db/schema";
import { matchesTagFilter } from "@workspace/lib/tag-utils";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { PromptChartSkeleton } from "@/components/cached-prompt-chart";
import { ALL_MODELS_VALUE } from "@/components/filter-bar";
import { FilteredListShell } from "@/components/filtered-list-shell";
import { PageHeader } from "@/components/page-header";
import { PromptOrderDropdown } from "@/components/prompt-order-dropdown";
import { VirtualizedPromptList } from "@/components/virtualized-prompt-list";
import { VisibilityBarSection } from "@/components/visibility-bar-section";
import { ChartDataProvider } from "@/contexts/chart-data-context";
import { useBatchChartData } from "@/hooks/use-batch-chart-data";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { type ChartSubject, generateDateRange, visibilityOverWindow } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/lookback";
import { coercePromptOrder, orderPrompts } from "@/lib/prompt-order";
import { skeletonRows } from "@/lib/skeleton-rows";

interface PromptsDisplayProps {
	pageTitle: string;
	pageDescription: string;
	pageInfoContent?: React.ReactNode;
}

/** Filtering is local, so this only has to coalesce a burst of keystrokes. */
const LOCAL_SEARCH_DEBOUNCE_MS = 40;

/** Host component: renders the page shell (title, sticky bar, content)
 *  and composes independent sub-sections. It doesn't subscribe to any
 *  filter state itself — each section reads the URL keys it cares about
 *  so a filter change only re-renders the sections that depend on it. */
export function PromptsDisplay({ pageTitle, pageDescription, pageInfoContent }: PromptsDisplayProps) {
	const { data: brand } = useBrand();
	return (
		<PageHeader title={pageTitle} subtitle={pageDescription} infoContent={pageInfoContent}>
			<PromptsContent brandId={brand?.id} />
		</PageHeader>
	);
}

/** Owns the single `usePromptsSummary` subscription for the page. Derives
 *  `availableTags`, the search-filtered prompt id list (used by both the
 *  visibility bar and the chart list), and passes them down. Child
 *  components still hold their own subscriptions to whichever URL keys
 *  they need, so a click on "Lookback" only invalidates the data users
 *  and not `FilterBar` itself. */
function PromptsContent({ brandId }: { brandId: string | undefined }) {
	const { data: brand } = useBrand(brandId);
	const brandParams = useBrandParams();
	const filters = useListFilters();
	const { model, lookback, tags, search } = filters;
	// `order` is this route's own search key (not a narrowing filter), so it
	// rides outside `useListFilters` / `isFiltered`.
	const order = useSearch({
		strict: false,
		select: (s) => coercePromptOrder((s as { order?: unknown }).order),
	});

	// Server hands us the targets this brand actually runs. FilterBar adds the
	// "all" sentinel on top; per-prompt chart controls only care about the
	// concrete list.
	const trackedTargets = brand?.trackedTargets ?? [];
	const availableIndividualModels = useMemo(() => trackedTargets.map((target) => target.value), [trackedTargets]);

	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const {
		data: promptsSummary,
		isLoading: isLoadingSummary,
		error: summaryError,
	} = usePromptsSummary(brandId, { lookback, model: modelParam });
	const { data: batchChartData, isLoading: isLoadingChartData } = useBatchChartData(brandId, {
		lookback,
		model: modelParam,
	});

	const availableTags = promptsSummary?.availableTags ?? [];

	const matchingPrompts = useMemo(() => {
		const needle = search.toLowerCase();
		return (promptsSummary?.prompts ?? []).filter(
			(prompt) => matchesTagFilter(prompt.tags, tags) && (!needle || prompt.value.toLowerCase().includes(needle)),
		);
	}, [promptsSummary, tags, search]);
	const sortedPrompts = useMemo(() => orderPrompts(matchingPrompts, order), [matchingPrompts, order]);

	const visibility = useMemo(() => {
		if (!batchChartData) return undefined;
		const { fromDate, toDate } = batchChartData.dateRange;
		return {
			...visibilityOverWindow(
				batchChartData.chartData,
				new Set(matchingPrompts.map((prompt) => prompt.id)),
				generateDateRange(new Date(fromDate), new Date(toDate)),
			),
			totalPrompts: matchingPrompts.length,
			totalCitations: matchingPrompts.reduce((total, prompt) => total + prompt.citations, 0),
		};
	}, [batchChartData, matchingPrompts]);

	const isInitialLoad = isLoadingSummary && !promptsSummary;

	return (
		<FilteredListShell
			filters={filters}
			availableTags={availableTags}
			trackedTargets={trackedTargets}
			showSearch
			searchDebounceMs={LOCAL_SEARCH_DEBOUNCE_MS}
			showModelSelector
			showResultCount
			filterBarExtras={<PromptOrderDropdown />}
			filterSectionExtras={<VisibilityBarSection visibility={visibility} lookback={lookback} />}
			isLoading={isInitialLoad}
			loadingState={<ContentLoadingSkeleton />}
			isError={Boolean(summaryError)}
			errorState={
				<Card className="p-6">
					<div className="text-center text-muted-foreground">
						<p className="mb-2">Failed to load prompts data</p>
						<p className="text-sm">Try refreshing the page</p>
					</div>
				</Card>
			}
			totalCount={promptsSummary?.prompts?.length}
			filteredCount={sortedPrompts.length}
			noMatchesTitle="No prompts match your filters."
			noMatchesDescription="Try adjusting your search or tag filters."
			emptyState={
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p className="mb-4">No prompts yet.</p>
						<Link
							to="/app/org/$org/brand/$brand/settings/prompts"
							params={brandParams}
							className={cn(buttonVariants({ size: "sm" }), "h-7 flex cursor-pointer")}
						>
							<IconEditCircle />
							<span>Edit</span>
						</Link>
					</div>
				</div>
			}
		>
			<ChartSection
				brandId={brandId}
				lookback={lookback}
				selectedModel={model}
				batchChartData={batchChartData}
				isLoadingChartData={isLoadingChartData}
				searchQuery={search}
				sortedPrompts={sortedPrompts}
				availableIndividualModels={availableIndividualModels}
			/>
		</FilteredListShell>
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
	batchChartData,
	isLoadingChartData,
	searchQuery,
	sortedPrompts,
	availableIndividualModels,
}: {
	brandId: string | undefined;
	lookback: LookbackPeriod;
	selectedModel: string;
	batchChartData: ReturnType<typeof useBatchChartData>["data"];
	isLoadingChartData: boolean;
	searchQuery: string;
	sortedPrompts: { id: string; value: string; firstEvaluatedAt?: Date | string | null }[];
	availableIndividualModels: string[];
}) {
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

	const brandForProvider: ChartSubject | null = batchChartData?.brand
		? { id: batchChartData.brand.id, name: batchChartData.brand.name }
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
			{skeletonRows(3).map((row) => (
				<PromptChartSkeleton key={row} />
			))}
		</div>
	);
}
