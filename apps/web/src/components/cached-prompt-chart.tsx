import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Fragment, memo, useCallback, useMemo } from "react";
import { useOptionalChartDataContext } from "@/contexts/chart-data-context";
import { useChartExport } from "@/hooks/use-chart-export";
import { visibilityBadgeProps } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/lookback";
import { BaseChart } from "./base-chart";
import { ChartActionsFooter } from "./chart-footer";

/** Inert bar silhouettes standing in for a chart that has nothing to plot. */
function PlaceholderBars({ heights }: { heights: readonly number[] }) {
	const bars = heights.map((height, index) => ({ key: `bar-${index}`, height }));
	return (
		<div className="h-16 w-full mb-3 flex items-end justify-center gap-[3px]">
			{bars.map((bar) => (
				<div key={bar.key} className="w-1.5 rounded-sm bg-muted-foreground/10" style={{ height: `${bar.height}%` }} />
			))}
		</div>
	);
}

/** The prompt name with the list's search term marked, so a filtered list shows why each card matched. */
function PromptTitle({ name, highlight }: { name: string; highlight: string }) {
	const term = highlight.trim();
	if (!term) return <CardTitle className="text-sm">{name}</CardTitle>;

	const pattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
	const segments = name.split(pattern).map((part, index) => ({
		key: `${index}-${part.slice(0, 8)}`,
		part,
		isMatch: part.toLowerCase() === term.toLowerCase(),
	}));

	return (
		<CardTitle className="text-sm">
			{segments.map((segment) =>
				segment.isMatch ? (
					<mark key={segment.key} className="bg-yellow-200 dark:bg-yellow-800 rounded-sm">
						{segment.part}
					</mark>
				) : (
					<Fragment key={segment.key}>{segment.part}</Fragment>
				),
			)}
		</CardTitle>
	);
}

/** Stands in for a chart card while its data loads; mirrors the success card's
 *  structure so the list doesn't jump when the real card arrives. */
export function PromptChartSkeleton() {
	return (
		<Card className="py-3 gap-3">
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
	);
}

export interface CachedPromptChartProps {
	promptId: string;
	promptName: string;
	brandId: string;
	lookback: LookbackPeriod;
	/** Current model filter from the URL. "all" = no filter. */
	selectedModel?: string;
	/** The targets this brand runs, as filter values — passed down so the export /
	 *  optimize button can offer them; don't include the "all" sentinel here. */
	availableModels: string[];
	searchHighlight?: string;
	/** Distinguishes first evaluation from an empty selected time window. */
	hasEverBeenEvaluated?: boolean;
}

// Memoized: when a sibling filter / react-query state change re-renders
// VirtualizedPromptList with identical props, 30+ of these don't need to
// walk their internal useMemos again.
export const CachedPromptChart = memo(function CachedPromptChart({
	promptId,
	promptName,
	brandId,
	lookback = "1m",
	selectedModel = "all",
	availableModels,
	searchHighlight = "",
	hasEverBeenEvaluated = false,
}: CachedPromptChartProps) {
	const chartContext = useOptionalChartDataContext();

	const chartData = useMemo(() => {
		if (!chartContext) return null;
		return chartContext.getChartDataForPrompt(promptId);
	}, [chartContext, promptId]);

	// Setup export functionality
	const fileName = chartContext?.brand
		? `${chartContext.brand.name}-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`
		: `chart-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
	const { isExporting, handleExport, portal: exportPortal } = useChartExport(fileName);

	const brand = chartContext?.brand ?? null;
	const competitors = chartContext?.competitors;
	const data = chartData?.chartData;
	const totalRuns = chartData?.totalRuns ?? 0;
	const hasVisibilityData = chartData?.hasVisibilityData ?? false;
	const lastBrandVisibility = chartData?.lastBrandVisibility ?? null;

	const handleDownload = useCallback(() => {
		if (!brand || !data || !competitors) return;
		handleExport({
			promptName,
			visibility: lastBrandVisibility,
			data,
			lookback,
			brand,
			competitors,
		});
	}, [handleExport, promptName, lastBrandVisibility, data, lookback, brand, competitors]);

	if (!chartContext || chartContext.isLoading || !chartData) {
		return <PromptChartSkeleton />;
	}

	// No runs state - distinguish between "never evaluated" vs "no data in selected window"
	if (totalRuns === 0) {
		const isFirstEval = !hasEverBeenEvaluated;

		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<PromptTitle name={promptName} highlight={searchHighlight} />
				</CardHeader>
				<Separator className="py-0 my-0" />
				{/* h-[300px] instead of h-[250px] to compensate for the missing footer section,
				   keeping overall card height consistent with data-filled cards for virtualization */}
				<CardContent className="px-3">
					<div className="h-[300px] flex items-center justify-center">
						<div className="flex flex-col items-center text-center max-w-xs">
							{isFirstEval ? (
								<>
									<div className="flex space-x-1.5 mb-3">
										<div className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse" />
										<div className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:0.2s]" />
										<div className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:0.4s]" />
									</div>
									<p className="text-sm font-medium text-muted-foreground">Evaluating for the first time</p>
									<p className="text-xs text-muted-foreground/70 mt-1">Results will appear here shortly.</p>
								</>
							) : (
								<>
									<PlaceholderBars heights={[20, 35, 15, 45, 25, 40, 30, 50, 20, 35, 45, 28]} />
									<p className="text-sm font-medium text-muted-foreground">No data in selected time range</p>
									<p className="text-xs text-muted-foreground/70 mt-1">
										Try selecting a longer time period to see historical data.
									</p>
								</>
							)}
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	// No visibility data state
	if (!hasVisibilityData) {
		return (
			<>
				{exportPortal}
				<Card className="py-3 gap-3">
					<CardHeader className="flex justify-between items-center px-3">
						<PromptTitle name={promptName} highlight={searchHighlight} />
					</CardHeader>
					<Separator className="py-0 my-0" />
					<CardContent className="px-3">
						<div className="h-[250px] flex items-center justify-center">
							<div className="flex flex-col items-center text-center max-w-xs">
								<PlaceholderBars heights={[10, 15, 8, 12, 10, 14, 8, 12, 10, 15, 12, 9]} />
								<p className="text-sm font-medium text-muted-foreground">No brands found in responses</p>
								<p className="text-xs text-muted-foreground/70 mt-1">
									Your brand and competitors weren't mentioned in the evaluated responses for this prompt.
								</p>
							</div>
						</div>
					</CardContent>
					<div className="print:hidden">
						<ChartActionsFooter
							promptId={promptId}
							brandId={brandId}
							promptName={promptName}
							onDownload={handleDownload}
							isDownloading={isExporting}
							selectedModel={selectedModel}
							availableModels={availableModels}
							lookback={lookback}
						/>
					</div>
				</Card>
			</>
		);
	}

	// Success state with chart
	return (
		<>
			{exportPortal}
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<PromptTitle name={promptName} highlight={searchHighlight} />
					{lastBrandVisibility !== null && (
						<Badge
							variant={visibilityBadgeProps(lastBrandVisibility).variant}
							className={visibilityBadgeProps(lastBrandVisibility).className}
						>
							{lastBrandVisibility}% Visibility
						</Badge>
					)}
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="pl-0 pr-6">
					{brand && data && competitors && (
						<BaseChart
							data={data}
							lookback={lookback}
							brand={brand}
							competitors={competitors}
							isAnimationActive={false}
							chartType="line"
						/>
					)}
				</CardContent>
				<div className="print:hidden">
					<ChartActionsFooter
						promptId={promptId}
						brandId={brandId}
						promptName={promptName}
						onDownload={handleDownload}
						isDownloading={isExporting}
						selectedModel={selectedModel}
						availableModels={availableModels}
						lookback={lookback}
					/>
				</div>
			</Card>
		</>
	);
});
