
import { useMemo } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { BaseChart } from "./base-chart";
import { ChartActionsFooter } from "./chart-actions-footer";
import { TextHighlighter } from "./text-highlighter";
import { useChartDownload } from "@/hooks/use-chart-download";
import { useOptionalChartDataContext } from "@/contexts/chart-data-context";
import type { LookbackPeriod } from "@/hooks/use-prompt-chart-data";
import {
	getBadgeVariant,
	getBadgeClassName,
} from "@/lib/chart-utils";

type ModelType = "openai" | "anthropic" | "google" | "all";

export interface CachedPromptChartProps {
	promptId: string;
	promptName: string;
	brandId: string;
	lookback: LookbackPeriod;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
	searchHighlight?: string;
	// Whether this prompt has ever been evaluated (all-time)
	// Used to distinguish "never evaluated" vs "no data in selected window"
	hasEverBeenEvaluated?: boolean;
}

export function CachedPromptChart({
	promptId,
	promptName,
	brandId,
	lookback = "1m",
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	searchHighlight = "",
	hasEverBeenEvaluated = false,
}: CachedPromptChartProps) {
	// Get data from context (pre-loaded)
	const chartContext = useOptionalChartDataContext();
	
	// Get processed chart data for this specific prompt
	const chartData = useMemo(() => {
		if (!chartContext) return null;
		return chartContext.getChartDataForPrompt(promptId);
	}, [chartContext, promptId]);

	// Setup download functionality
	const fileName = chartContext?.brand 
		? `${chartContext.brand.name}-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`
		: `chart-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
	const { chartRef, isDownloading, handleDownload } = useChartDownload(fileName);

	// Loading state — structure matches the success state card exactly:
	// CardHeader (title + badge), Separator, CardContent (pl-0 pr-6, h-[250px]), footer
	if (!chartContext || chartContext.isLoading || !chartData) {
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

	const { brand, competitors } = chartContext;
	const { chartData: data, totalRuns, hasVisibilityData, lastBrandVisibility } = chartData;

	// Helper to render the title with optional highlighting
	const renderTitle = () => (
		<CardTitle className="text-sm">
			<TextHighlighter text={promptName} highlight={searchHighlight} />
		</CardTitle>
	);

	// No runs state - distinguish between "never evaluated" vs "no data in selected window"
	if (totalRuns === 0) {
		const isFirstEval = !hasEverBeenEvaluated;

		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					{renderTitle()}
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
									<p className="text-sm font-medium text-muted-foreground">
										Evaluating for the first time
									</p>
									<p className="text-xs text-muted-foreground/70 mt-1">
										Results will appear here shortly.
									</p>
								</>
							) : (
								<>
									<div className="h-16 w-full mb-3 flex items-end justify-center gap-[3px]">
										{[20, 35, 15, 45, 25, 40, 30, 50, 20, 35, 45, 28].map((h, i) => (
											<div
												key={i}
												className="w-1.5 rounded-sm bg-muted-foreground/10"
												style={{ height: `${h}%` }}
											/>
										))}
									</div>
									<p className="text-sm font-medium text-muted-foreground">
										No data in selected time range
									</p>
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
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					{renderTitle()}
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div className="h-[250px] flex items-center justify-center">
						<div className="flex flex-col items-center text-center max-w-xs">
							<div className="h-16 w-full mb-3 flex items-end justify-center gap-[3px]">
								{[10, 15, 8, 12, 10, 14, 8, 12, 10, 15, 12, 9].map((h, i) => (
									<div
										key={i}
										className="w-1.5 rounded-sm bg-muted-foreground/10"
										style={{ height: `${h}%` }}
									/>
								))}
							</div>
							<p className="text-sm font-medium text-muted-foreground">
								No brands found in responses
							</p>
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
						isDownloading={isDownloading}
						selectedModel={selectedModel}
						availableModels={availableModels}
						lookback={lookback}
					/>
				</div>
			</Card>
		);
	}

	// Success state with chart
	return (
		<Card ref={chartRef} className="py-3 gap-3">
			<CardHeader className="flex justify-between items-center px-3">
				{renderTitle()}
				{lastBrandVisibility !== null && (
					<Badge variant={getBadgeVariant(lastBrandVisibility)} className={getBadgeClassName(lastBrandVisibility)}>
						{lastBrandVisibility}% Visibility
					</Badge>
				)}
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="pl-0 pr-6">
				{brand && (
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
					isDownloading={isDownloading}
					selectedModel={selectedModel}
					availableModels={availableModels}
					lookback={lookback}
				/>
			</div>
		</Card>
	);
}
