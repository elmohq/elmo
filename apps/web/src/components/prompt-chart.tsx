"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { BaseChart } from "./base-chart";
import { ChartActionsFooter } from "./chart-actions-footer";
import { TextHighlighter } from "./text-highlighter";
import { useChartDownload } from "@/hooks/use-chart-download";
import { usePromptChartData } from "@/hooks/use-prompt-chart-data";
import type { LookbackPeriod } from "@/hooks/use-prompt-chart-data";
import {
	getBadgeVariant,
	getBadgeClassName,
} from "@/lib/chart-utils";

type ModelType = "openai" | "anthropic" | "google" | "all";

interface PromptChartProps {
	lookback: LookbackPeriod;
	promptName: string;
	promptId: string;
	brandId: string;
	webSearchEnabled?: boolean;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
	enabled?: boolean;
	priority?: "high" | "normal" | "low"; // For intelligent loading
	searchHighlight?: string;
}

export function PromptChart({
	lookback = "1m",
	promptName,
	promptId,
	brandId,
	webSearchEnabled,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	enabled = true,
	priority = "normal",
	searchHighlight = "",
}: PromptChartProps) {
	// Use the optimized hook
	const { chartData, isLoading, isError } = usePromptChartData(
		brandId,
		promptId,
		{
			lookback,
			webSearchEnabled,
			modelGroup: selectedModel === "all" ? undefined : selectedModel,
		},
		enabled
	);

	// Setup download functionality
	const fileName = chartData?.brand 
		? `${chartData.brand.name}-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`
		: `chart-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
	const { chartRef, isDownloading, handleDownload } = useChartDownload(fileName);

	// Determine chart type based on lookback period
	const chartType = lookback === "1w" ? "bar" : "line";

	// Ultra-fast loading skeleton (simplified)
	if (isLoading || !enabled) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<div className="flex items-center gap-2">
						<Skeleton className="h-4 w-4 rounded" />
						<Skeleton className="h-4 w-48" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-6 w-20 rounded-full" />
						<Skeleton className="h-8 w-8 rounded" />
					</div>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div className="h-[200px] flex items-center justify-center">
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
			</Card>
		);
	}

	// Helper to render the title with optional highlighting
	const renderTitle = () => (
		<CardTitle className="text-sm">
			<TextHighlighter text={promptName} highlight={searchHighlight} />
		</CardTitle>
	);

	// Fast error state
	if (isError) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					{renderTitle()}
					<Badge variant="destructive" className="text-xs">
						Failed to load
					</Badge>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div className="h-[200px] flex items-center justify-center text-muted-foreground">
						<div className="text-center">
							<p className="text-sm">Unable to load chart</p>
							<p className="text-xs mt-1">Try refreshing</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!chartData) {
		return null;
	}

	const { 
		prompt, 
		chartData: data, 
		brand, 
		competitors, 
		totalRuns, 
		hasVisibilityData, 
		lastBrandVisibility,
	} = chartData;

	// No runs state
	if (totalRuns === 0) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					{renderTitle()}
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div>
						<span className="font-semibold text-xl text-muted-foreground">
							Evaluating for the first time...
						</span>
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
					<div>
						<span className="font-semibold text-xl text-muted-foreground">
							No brands found.
						</span>
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
				<BaseChart
					data={data}
					lookback={lookback}
					brand={brand}
					competitors={competitors}
					isAnimationActive={false}
					chartType={chartType}
				/>
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
