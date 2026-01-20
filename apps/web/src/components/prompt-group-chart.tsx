"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { BaseChart } from "./base-chart";
import { ChartActionsFooter } from "./chart-actions-footer";
import { useChartDownload } from "@/hooks/use-chart-download";
import { useCompetitors, useBrand } from "@/hooks/use-brands";
import { usePromptRuns } from "@/hooks/use-prompt-runs";
import type { PromptRun } from "@workspace/lib/db/schema";
import { LookbackPeriod, calculateGroupVisibilityData, createPromptToWebQueryMapping } from "@/lib/chart-utils";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

type ModelType = "openai" | "anthropic" | "google" | "all";

interface PromptGroupChartProps {
	lookback: LookbackPeriod;
	groupName: string;
	prompts: Prompt[];
	brandId?: string;
	promptRuns?: PromptRun[];
	webSearchEnabled?: boolean;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
}

export function PromptGroupChart({
	lookback = "1m",
	groupName,
	prompts = [],
	brandId,
	promptRuns: propPromptRuns,
	webSearchEnabled,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
}: PromptGroupChartProps) {
	const { competitors, isLoading: competitorsLoading } = useCompetitors(brandId);
	const { brand, isLoading: brandLoading } = useBrand(brandId);
	const { promptRuns: hookPromptRuns, isLoading: runsLoading } = usePromptRuns(brandId, { lookback });

	// Use prop promptRuns if provided, otherwise fall back to hook
	const promptRuns = propPromptRuns || hookPromptRuns;
	const isLoading = competitorsLoading || brandLoading || (!propPromptRuns && runsLoading);

	// Setup download functionality
	const fileName = brand 
		? `${brand.name}-${groupName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`
		: `chart-${groupName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
	const { chartRef, isDownloading, handleDownload } = useChartDownload(fileName);

	// Check if we have no prompt runs for any prompts in this group after loading is complete
	const promptIds = prompts.map((p) => p.id);
	const groupPromptRuns = promptRuns?.filter((run) => promptIds.includes(run.promptId)) || [];
	const hasNoRuns = !isLoading && groupPromptRuns.length === 0;

	// Calculate visibility data for all prompts in the group
	const groupVisibilityData =
		isLoading || !brand ? [] : calculateGroupVisibilityData(promptRuns || [], prompts, brand, competitors, lookback);

	// Check if there's any non-zero visibility data across all brands and competitors for any prompt in the group
	const hasVisibilityData = groupVisibilityData.some((promptData) => {
		return promptData.chartData.some((dataPoint) => {
			// Check if any brand (main brand or competitors) has non-zero visibility
			const allBrandIds = [brand?.id, ...(competitors?.map((c) => c.id) || [])].filter(Boolean);
			return allBrandIds.some((brandId) => {
				const visibility = dataPoint[brandId as string];
				return visibility !== null && visibility !== undefined && Number(visibility) > 0;
			});
		});
	});

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
					<CardTitle className="text-sm">
						{prompts[0]?.groupPrefix}{" "}
						<span className="text-muted-foreground">
							{`<`}
							{prompts[0]?.groupCategory?.toLowerCase()}
							{`>`}
						</span>
					</CardTitle>
					<div className="flex items-center gap-2">
						<Skeleton className="h-6 w-20" />
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
					<CardTitle className="text-sm">
						{prompts[0]?.groupPrefix}{" "}
						<span className="text-muted-foreground">
							{`<`}
							{prompts[0]?.groupCategory?.toLowerCase()}
							{`>`}
						</span>
					</CardTitle>
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

	// Show "No brands found" message when there's no visibility data for any prompts in the group
	if (!hasVisibilityData) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">
						{prompts[0]?.groupPrefix}{" "}
						<span className="text-muted-foreground">
							{`<`}
							{prompts[0]?.groupCategory?.toLowerCase()}
							{`>`}
						</span>
					</CardTitle>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div>
						<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
							No brands found.
						</span>
					</div>
				</CardContent>
				<ChartActionsFooter 
					brandId={brand?.id}
					brandName={brand?.name}
					prompts={prompts.map((p) => ({ id: p.id, value: p.value }))}
					groupPrefix={prompts[0]?.groupPrefix || undefined}
					groupName={groupName}
					onDownload={handleDownload}
					isDownloading={isDownloading}
					webSearchEnabled={webSearchEnabled}
					selectedModel={selectedModel}
					availableModels={availableModels}
					webQueryMapping={webQueryMapping}
					modelWebQueryMappings={modelWebQueryMappings}
				/>
			</Card>
		);
	}

	return (
		<Card ref={chartRef} className="py-3 gap-3">
			<CardHeader className="flex justify-between items-center px-3">
				<CardTitle className="text-sm">
					{prompts[0]?.groupPrefix}{" "}
					<span className="text-muted-foreground">
						{`<`}
						{prompts[0]?.groupCategory?.toLowerCase()}
						{`>`}
					</span>
				</CardTitle>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="pl-0 pr-6">
				<div className={`grid grid-cols-1 lg:grid-cols-2 gap-3`}>
					{groupVisibilityData.map((promptData) => (
						<BaseChart
							key={promptData.promptId}
							data={promptData.chartData}
							lookback={lookback}
							title={promptData.promptTitle}
							visibility={promptData.lastVisibility}
							showTitle={true}
							showBadge={true}
							brand={brand}
							competitors={competitors}
							isAnimationActive={false}
							chartType={chartType}
						/>
					))}
				</div>
			</CardContent>
			<div className="print:hidden">
				<ChartActionsFooter 
					brandId={brand?.id}
					brandName={brand?.name}
					prompts={prompts.map((p) => ({ id: p.id, value: p.value }))}
					groupPrefix={prompts[0]?.groupPrefix || undefined}
					groupName={groupName}
					onDownload={handleDownload}
					isDownloading={isDownloading}
					webSearchEnabled={webSearchEnabled}
					selectedModel={selectedModel}
					availableModels={availableModels}
					webQueryMapping={webQueryMapping}
					modelWebQueryMappings={modelWebQueryMappings}
				/>
			</div>
		</Card>
	);
}
