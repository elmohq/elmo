"use client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { BaseChart } from "./base-chart";
import { OptimizeButton } from "./optimize-button";
import { HistoryButton } from "./history-button";
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

	// Fast error state
	if (isError) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">{promptName}</CardTitle>
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

	const { prompt, chartData: data, brand, competitors, totalRuns, hasVisibilityData, lastBrandVisibility } = chartData;

	// No runs state
	if (totalRuns === 0) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">{promptName}</CardTitle>
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
					<div className="flex items-center gap-2">
						<HistoryButton promptName={promptName} promptId={promptId} brandId={brandId} />
						<CardTitle className="text-sm">{promptName}</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<OptimizeButton
							promptName={promptName}
							promptId={promptId}
							brandId={brandId}
							webSearchEnabled={webSearchEnabled}
							selectedModel={selectedModel}
							availableModels={availableModels}
							webQueryMapping={{}} // Simplified for speed
							modelWebQueryMappings={{}}
						/>
					</div>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div>
						<span className="font-semibold text-xl text-muted-foreground">
							No brands found.
						</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Success state with chart
	return (
		<Card className="py-3 gap-3">
			<CardHeader className="flex justify-between items-center px-3">
				<div className="flex items-center gap-2">
					<HistoryButton promptName={promptName} promptId={promptId} brandId={brandId} />
					<CardTitle className="text-sm">{promptName}</CardTitle>
				</div>
				<div className="flex items-center gap-2">
					{lastBrandVisibility !== null && (
						<Badge variant={getBadgeVariant(lastBrandVisibility)} className={getBadgeClassName(lastBrandVisibility)}>
							{lastBrandVisibility}% Visibility
						</Badge>
					)}
					<OptimizeButton
						promptName={promptName}
						promptId={promptId}
						brandId={brandId}
						webSearchEnabled={webSearchEnabled}
						selectedModel={selectedModel}
						availableModels={availableModels}
						webQueryMapping={{}} // Simplified for speed
						modelWebQueryMappings={{}}
					/>
				</div>
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
		</Card>
	);
}
