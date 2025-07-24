"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { BaseChartPrint } from "./base-chart-print";
import type { Brand, Competitor } from "@/lib/db/schema";
import { LookbackPeriod, calculateGroupVisibilityData } from "@/lib/chart-utils";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface PromptRunData {
	id: string;
	promptId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: Date;
	modelGroup: "openai" | "anthropic" | "google";
	model: string;
	webSearchEnabled: boolean;
	rawOutput: any;
	webQueries: string[];
}

interface PromptGroupChartPrintProps {
	lookback: LookbackPeriod;
	groupName: string;
	prompts: Prompt[];
	brand: Brand;
	competitors: Competitor[];
	promptRuns: PromptRunData[];
}

export function PromptGroupChartPrint({
	lookback = "1m",
	groupName,
	prompts = [],
	brand,
	competitors,
	promptRuns,
}: PromptGroupChartPrintProps) {
	// Check if we have no prompt runs for any prompts in this group
	const promptIds = prompts.map((p) => p.id);
	const groupPromptRuns = promptRuns?.filter((run) => promptIds.includes(run.promptId)) || [];
	const hasNoRuns = groupPromptRuns.length === 0;

	// Calculate visibility data for all prompts in the group
	const groupVisibilityData = calculateGroupVisibilityData(promptRuns || [], prompts, brand, competitors, lookback);

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

	// Determine chart type based on lookback period
	const chartType = lookback === "1w" ? "bar" : "line";

	if (hasNoRuns) {
		return (
			<Card className="py-3 gap-3 print:shadow-none print:border print-break-inside-avoid">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm print:text-xs">
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
						<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground print:text-lg">
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
			<Card className="py-3 gap-3 print:shadow-none print:border print-break-inside-avoid">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm print:text-xs">
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
						<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground print:text-lg">
							No brands found.
						</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="py-3 gap-3 print:shadow-none print:border print-break-inside-avoid">
			<CardHeader className="flex justify-between items-center px-3">
				<CardTitle className="text-sm print:text-xs">
					{prompts[0]?.groupPrefix}{" "}
					<span className="text-muted-foreground">
						{`<`}
						{prompts[0]?.groupCategory?.toLowerCase()}
						{`>`}
					</span>
				</CardTitle>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="pl-0 pr-6 print:pr-3">
				<div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 print:grid-cols-1 print:gap-2`}>
					{groupVisibilityData.map((promptData) => (
						<BaseChartPrint
							key={promptData.promptId}
							data={promptData.chartData}
							title={promptData.promptTitle}
							visibility={promptData.lastVisibility}
							showTitle={true}
							showBadge={true}
							brand={brand}
							competitors={competitors}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
} 