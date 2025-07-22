"use client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { BaseChart } from "./base-chart";
import { OptimizeButton } from "./optimize-button";
import { HistoryButton } from "./history-button";
import { useCompetitors, useBrand } from "@/hooks/use-brands";
import { usePromptRuns } from "@/hooks/use-prompt-runs";
import type { PromptRun } from "@/lib/db/schema";
import {
	LookbackPeriod,
	getBadgeVariant,
	getBadgeClassName,
	calculateVisibilityPercentages,
	createPromptToWebQueryMapping,
} from "@/lib/chart-utils";

type ModelType = "openai" | "anthropic" | "google" | "all";

interface PromptChartProps {
	lookback: LookbackPeriod;
	promptName: string;
	promptId: string;
	brandId?: string;
	promptRuns?: PromptRun[];
	webSearchEnabled?: boolean;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
}

export function PromptChart({
	lookback = "1m",
	promptName,
	promptId,
	brandId,
	promptRuns: propPromptRuns,
	webSearchEnabled,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
}: PromptChartProps) {
	const { competitors, isLoading: competitorsLoading } = useCompetitors(brandId);
	const { brand, isLoading: brandLoading } = useBrand(brandId);
	const { promptRuns: hookPromptRuns, isLoading: runsLoading } = usePromptRuns(brandId, { lookback });

	// Use prop promptRuns if provided, otherwise fall back to hook
	const promptRuns = propPromptRuns || hookPromptRuns;
	const isLoading = competitorsLoading || brandLoading || (!propPromptRuns && runsLoading);

	// Filter prompt runs for this specific prompt
	const promptSpecificRuns = promptRuns?.filter((run) => run.promptId === promptId) || [];

	// Check if we have no prompt runs after loading is complete
	const hasNoRuns = !isLoading && promptSpecificRuns.length === 0;

	// Calculate chart data from real prompt runs
	const chartData =
		isLoading || !brand ? [] : calculateVisibilityPercentages(promptSpecificRuns, brand, competitors, lookback);

	// Check if there's any non-zero visibility data across all brands and competitors
	const hasVisibilityData = chartData.some((dataPoint) => {
		// Check if any brand (main brand or competitors) has non-zero visibility
		const allBrandIds = [brand?.id, ...(competitors?.map((c) => c.id) || [])].filter(Boolean);
		return allBrandIds.some((brandId) => {
			const visibility = dataPoint[brandId as string];
			return visibility !== null && visibility !== undefined && Number(visibility) > 0;
		});
	});

	// Get the last visibility value for the badge (brand visibility)
	const lastDataPoint = chartData.filter((point) => brand && point[brand.id] !== null).pop();
	const lastBrandVisibility = lastDataPoint && brand ? (lastDataPoint[brand.id] as number) : null;

	// Create web query mapping for optimization URLs
	const webQueryMapping = promptRuns ? createPromptToWebQueryMapping(promptRuns) : {};

	// Create model-specific web query mappings for the dropdown
	const modelWebQueryMappings: Record<string, Record<string, string>> = {};
	if (promptRuns && selectedModel === "all") {
		availableModels.forEach((model) => {
			const modelPromptRuns = promptRuns.filter((run) => run.modelGroup === model);
			modelWebQueryMappings[model] = createPromptToWebQueryMapping(modelPromptRuns);
		});
	}

	// Determine chart type based on lookback period
	const chartType = lookback === "1w" ? "bar" : "line";

	if (isLoading || !brand) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">{promptName}</CardTitle>
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="text-xs">
							Loading...
						</Badge>
					</div>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="pl-0 pr-6">
					<div className="h-[250px] flex items-center justify-center text-muted-foreground">Loading chart data...</div>
				</CardContent>
			</Card>
		);
	}

	if (hasNoRuns) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">{promptName}</CardTitle>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div>
						<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
							Evaluating for the first time...
						</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Show "No brands found" message when there's no visibility data
	if (!hasVisibilityData) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<div className="flex items-center gap-2">
						<HistoryButton promptName={promptName} promptId={promptId} brandId={brand?.id} />
						<CardTitle className="text-sm">{promptName}</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<OptimizeButton
							promptName={promptName}
							promptId={promptId}
							brandId={brand?.id}
							webSearchEnabled={webSearchEnabled}
							selectedModel={selectedModel}
							availableModels={availableModels}
							webQueryMapping={webQueryMapping}
							modelWebQueryMappings={modelWebQueryMappings}
						/>
					</div>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div>
						<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
							No brands found.
						</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="py-3 gap-3">
			<CardHeader className="flex justify-between items-center px-3">
				<div className="flex items-center gap-2">
					<HistoryButton promptName={promptName} promptId={promptId} brandId={brand?.id} />
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
						brandId={brand?.id}
						webSearchEnabled={webSearchEnabled}
						selectedModel={selectedModel}
						availableModels={availableModels}
						webQueryMapping={webQueryMapping}
						modelWebQueryMappings={modelWebQueryMappings}
					/>
				</div>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="pl-0 pr-6">
				<BaseChart
					data={chartData}
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
