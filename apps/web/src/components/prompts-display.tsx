import { IconEditCircle } from "@tabler/icons-react";
import { Link, useSearch } from "@tanstack/react-router";
import type { Competitor } from "@workspace/lib/db/schema";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { Inbox } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { CompetitiveVisibilitySection } from "@/components/competitive-visibility/section";
import { ALL_MODELS_VALUE } from "@/components/filter-bar";
import { FilteredListShell } from "@/components/filtered-list-shell";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { PromptOrderDropdown } from "@/components/prompt-order-dropdown";
import { VirtualizedPromptList } from "@/components/virtualized-prompt-list";
import { ChartDataProvider } from "@/contexts/chart-data-context";
import { useBatchChartData } from "@/hooks/use-batch-chart-data";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import type { ChartSubject, LookbackPeriod } from "@/lib/chart-utils";
import { coercePromptOrder, orderPrompts, type PromptOrder } from "@/lib/prompt-order";
import { skeletonRows } from "@/lib/skeleton-rows";

const VISIBILITY_PROMPT_PAGE_SIZE = 10;

interface PromptsDisplayProps {
	pageTitle: string;
	pageDescription: string;
	pageInfoContent?: React.ReactNode;
}

/** Host component: renders the page shell (title, sticky bar, content)
 *  and composes independent sub-sections. It doesn't subscribe to any
 *  filter state itself — each section reads the URL keys it cares about
 *  so a filter change only re-renders the sections that depend on it. */
export function PromptsDisplay({ pageTitle, pageDescription, pageInfoContent }: PromptsDisplayProps) {
	const { brand } = useBrand();
	return (
		<PageHeader title={pageTitle} subtitle={pageDescription} infoContent={pageInfoContent}>
			<PromptsContent brandId={brand?.id} />
		</PageHeader>
	);
}

/** Owns the single `usePromptsSummary` subscription for the page. Derives
 *  `availableTags` and the search-filtered, ordered prompt list, and passes
 *  the filter scope to the competitive overview and the chart list. Child
 *  components still hold their own subscriptions to whichever URL keys
 *  they need, so a click on "Lookback" only invalidates the data users
 *  and not `FilterBar` itself. */
function PromptsContent({ brandId }: { brandId: string | undefined }) {
	const { brand } = useBrand(brandId);
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
		promptsSummary,
		isLoading: isLoadingSummary,
		isError: summaryError,
	} = usePromptsSummary(brandId, {
		lookback,
		model: modelParam,
		tags: tags.length > 0 ? tags : undefined,
	});

	const availableTags = promptsSummary?.availableTags ?? [];

	// The prompt list is still search-filtered client-side for display, then
	// re-ordered per the `order` control (#60). The chart/visibility sections
	// no longer receive this id list — they resolve the same prompts
	// server-side from the tag + search filters (issue #68).
	const sortedPrompts = useMemo(() => {
		if (!promptsSummary) return [];
		const allPrompts = promptsSummary.prompts;
		const filtered = search
			? allPrompts.filter((p) => p.value.toLowerCase().includes(search.toLowerCase()))
			: allPrompts;
		return orderPrompts(filtered, order);
	}, [promptsSummary, search, order]);

	const isInitialLoad = isLoadingSummary && !promptsSummary;

	return (
		<FilteredListShell
			filters={filters}
			availableTags={availableTags}
			trackedTargets={trackedTargets}
			showSearch
			showModelSelector
			showResultCount
			filterBarExtras={<PromptOrderDropdown />}
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
			<CompetitiveVisibilitySection
				brandId={brandId}
				filters={{
					lookback,
					model: modelParam,
					tags: tags.length > 0 ? tags : undefined,
					search: search || undefined,
				}}
			/>
			<ChartSection
				brandId={brandId}
				lookback={lookback}
				selectedModel={model}
				modelParam={modelParam}
				searchQuery={search}
				selectedTags={tags}
				order={order}
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
	modelParam,
	searchQuery,
	selectedTags,
	order,
	sortedPrompts,
	availableIndividualModels,
}: {
	brandId: string | undefined;
	lookback: LookbackPeriod;
	selectedModel: string;
	modelParam: string | undefined;
	searchQuery: string;
	selectedTags: string[];
	order: PromptOrder;
	sortedPrompts: PromptListItem[];
	availableIndividualModels: string[];
}) {
	const { batchChartData, isLoading: isLoadingChartData } = useBatchChartData(brandId, {
		lookback,
		model: modelParam,
		tags: selectedTags.length > 0 ? selectedTags : undefined,
		search: searchQuery || undefined,
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
			previousNames: [],
			active: true,
			removedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		})) || [];

	const paginationScopeKey = JSON.stringify([
		modelParam ?? ALL_MODELS_VALUE,
		lookback,
		selectedTags,
		searchQuery,
		order,
	]);

	return (
		<ChartDataProvider
			batchData={batchChartData?.chartData || null}
			brand={brandForProvider}
			competitors={competitorsForProvider}
			startDate={startDate}
			endDate={endDate}
			isLoading={isLoadingChartData}
		>
			{/* Keyed on the scope the user can see, so a filter or order change
			    starts over at page 1 while a background refetch of the same
			    scope (new array identity, same key) keeps the user's page. */}
			<PagedPromptList
				key={paginationScopeKey}
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

type PromptListItem = { id: string; value: string; firstEvaluatedAt?: Date | string | null };

/** Client-side pages of ten over the complete filtered, ordered list. Only the
 *  current page reaches the virtualizer; the overview and batch chart query
 *  above keep the whole scope. */
function PagedPromptList({
	prompts,
	...listProps
}: {
	prompts: PromptListItem[];
	brandId: string;
	lookback: LookbackPeriod;
	selectedModel: string;
	availableModels: string[];
	searchHighlight: string;
}) {
	const { page, setPage, pageItems, pageSize, totalItems } = usePagedList(prompts, VISIBILITY_PROMPT_PAGE_SIZE);
	const listRef = useRef<HTMLDivElement>(null);
	// Pages are several viewports tall and the pager sits at the bottom, so an
	// explicit Previous/Next brings the new page's first card into view. The
	// flag is set by the pager only: mounting and the hook's clamp never scroll.
	const revealOnCommit = useRef(false);

	useEffect(() => {
		if (!revealOnCommit.current) return;
		revealOnCommit.current = false;
		listRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
	});

	const handlePageChange = (next: number) => {
		revealOnCommit.current = next !== page;
		setPage(next);
	};

	return (
		<div>
			<div ref={listRef} data-testid="visibility-prompt-list" className="scroll-mt-20">
				<VirtualizedPromptList prompts={pageItems} {...listProps} />
			</div>
			<div data-testid="visibility-prompt-pagination">
				<ListPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={handlePageChange} />
			</div>
		</div>
	);
}

function ContentLoadingSkeleton() {
	return (
		<div className="space-y-6">
			{skeletonRows(3).map((row) => (
				<Card key={row} className="py-3 gap-3">
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
