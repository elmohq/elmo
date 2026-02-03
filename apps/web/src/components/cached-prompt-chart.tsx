"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
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

interface CachedPromptChartProps {
	promptId: string;
	promptName: string;
	brandId: string;
	lookback: LookbackPeriod;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
	searchHighlight?: string;
}

export function CachedPromptChart({
	promptId,
	promptName,
	brandId,
	lookback = "1m",
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	searchHighlight = "",
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

	// Determine chart type based on lookback period
	const chartType = lookback === "1w" ? "bar" : "line";

	// Loading state
	if (!chartContext || chartContext.isLoading || !chartData) {
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

	const { brand, competitors } = chartContext;
	const { chartData: data, totalRuns, hasVisibilityData, lastBrandVisibility } = chartData;

	// Helper to render the title with optional highlighting
	const renderTitle = () => (
		<CardTitle className="text-sm">
			<TextHighlighter text={promptName} highlight={searchHighlight} />
		</CardTitle>
	);

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
				{brand && (
					<BaseChart
						data={data}
						lookback={lookback}
						brand={brand}
						competitors={competitors}
						isAnimationActive={false}
						chartType={chartType}
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
