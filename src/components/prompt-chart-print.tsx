"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { BaseChartPrint } from "./base-chart-print";
import type { Brand, Competitor } from "@/lib/db/schema";
import {
	LookbackPeriod,
	getBadgeVariant,
	getBadgeClassName,
	calculateVisibilityPercentages,
	selectCompetitorsToDisplay,
} from "@/lib/chart-utils";

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

interface PromptChartPrintProps {
	lookback: LookbackPeriod;
	promptName: string;
	promptId: string;
	brand: Brand;
	competitors: Competitor[];
	promptRuns: PromptRunData[];
}

export function PromptChartPrint({
	lookback = "1m",
	promptName,
	promptId,
	brand,
	competitors,
	promptRuns,
}: PromptChartPrintProps) {
	// Filter prompt runs for this specific prompt
	const promptSpecificRuns = promptRuns?.filter((run) => run.promptId === promptId) || [];

	// Check if we have no prompt runs
	const hasNoRuns = promptSpecificRuns.length === 0;

	// Calculate chart data from real prompt runs
	const chartData = calculateVisibilityPercentages(promptSpecificRuns, brand, competitors, lookback);

	// Select top competitors by visibility, filling with alphabetical order if needed
	const selectedCompetitors = selectCompetitorsToDisplay(competitors, chartData, 5);

	// Check if there's any non-zero visibility data for brand or selected competitors
	const hasVisibilityData = chartData.some((dataPoint) => {
		// Check brand visibility
		const brandVisibility = dataPoint[brand.id] as number;
		if (brandVisibility !== null && brandVisibility !== undefined && Number(brandVisibility) > 0) {
			return true;
		}

		// Check selected competitor visibility
		return selectedCompetitors.some((competitor) => {
			const visibility = dataPoint[competitor.id] as number;
			return visibility !== null && visibility !== undefined && Number(visibility) > 0;
		});
	});

	// Get the last visibility value for the badge (brand visibility)
	const lastDataPoint = chartData.filter((point) => brand && point[brand.id] !== null).pop();
	const lastBrandVisibility = lastDataPoint && brand ? (lastDataPoint[brand.id] as number) : null;

	// Determine chart type based on lookback period
	const chartType = lookback === "1w" ? "bar" : "line";

	if (hasNoRuns) {
		return (
			<Card className="py-3 gap-3 print:shadow-none print:border">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm print:text-xs">{promptName}</CardTitle>
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

	// Show "No brands found" message when there's no visibility data
	if (!hasVisibilityData) {
		return (
			<Card className="py-3 gap-3 print:shadow-none print:border">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm print:text-xs">{promptName}</CardTitle>
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
				<CardTitle className="text-sm print:text-xs">{promptName}</CardTitle>
				<div className="flex items-center gap-2">
					{lastBrandVisibility !== null && (
						<Badge
							variant={getBadgeVariant(lastBrandVisibility)}
							className={`${getBadgeClassName(lastBrandVisibility)} print:text-xs`}
						>
							{lastBrandVisibility}% Visibility
						</Badge>
					)}
				</div>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="p-0">
				<BaseChartPrint data={chartData} brand={brand} competitors={selectedCompetitors} />
			</CardContent>
		</Card>
	);
}
