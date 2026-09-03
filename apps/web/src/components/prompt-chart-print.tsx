import type { Competitor } from "@workspace/lib/db/schema";
import { getSoVBadgeClasses, type PromptCategory } from "@workspace/lib/report-metrics";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import type { ReactNode, RefObject } from "react";
import { useChartDownload } from "@/hooks/use-chart-download";
import {
	type ChartDataPoint,
	type ChartSubject,
	calculateVisibilityPercentages,
	getBadgeClassName,
	getBadgeVariant,
	type LookbackPeriod,
	selectCompetitorsToDisplay,
} from "@/lib/chart-utils";
import { BaseChartPrint } from "./base-chart-print";
import { ChartDownloadFooter } from "./chart-download-footer";

interface PromptRunData {
	id: string;
	promptId: string;
	brandId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: Date;
	model: string;
	provider: string | null;
	version: string;
	webSearchEnabled: boolean;
	rawOutput: any;
	webQueries: string[];
}

interface PromptChartPrintProps {
	lookback: LookbackPeriod;
	promptName: string;
	promptId: string;
	brand: ChartSubject;
	competitors: Competitor[];
	promptRuns: PromptRunData[];
	/** Distinguishes first evaluation from an empty selected time window. */
	hasEverBeenEvaluated?: boolean;
	category?: PromptCategory;
}

function countMentions(runs: PromptRunData[], competitors: Competitor[]) {
	const byCompetitor: Record<string, number> = Object.fromEntries(competitors.map((comp) => [comp.id, 0]));
	let brand = 0;

	for (const run of runs) {
		if (run.brandMentioned) brand++;
		for (const comp of competitors) {
			if (run.competitorsMentioned?.includes(comp.name)) byCompetitor[comp.id]++;
		}
	}

	return { brand, byCompetitor };
}

/**
 * Compute SoV for each entity (brand + competitors) from prompt runs.
 * Returns data shaped for BaseChartPrint: one data point with entity IDs as keys.
 */
function computeSoVChartData(
	runs: PromptRunData[],
	brand: ChartSubject,
	competitors: Competitor[],
): ChartDataPoint[] | null {
	if (runs.length === 0) return null;

	const mentions = countMentions(runs, competitors);
	const totalMentions = mentions.brand + Object.values(mentions.byCompetitor).reduce((s, c) => s + c, 0);
	if (totalMentions === 0) return null;

	const dataPoint: ChartDataPoint = { date: "sov" };
	dataPoint[brand.id] = Math.round((mentions.brand / totalMentions) * 100);
	for (const comp of competitors) {
		dataPoint[comp.id] = Math.round((mentions.byCompetitor[comp.id] / totalMentions) * 100);
	}

	return [dataPoint];
}

/** True once any displayed entity has a non-zero value somewhere in the series. */
function hasAnyVisibility(chartData: ChartDataPoint[], entityIds: string[]): boolean {
	return chartData.some((dataPoint) => entityIds.some((id) => Number(dataPoint[id] ?? 0) > 0));
}

/** SoV of the single report data point, or the latest dashboard visibility reading. */
function resolveBadgeValue(
	sovChartData: ChartDataPoint[] | null,
	chartData: ChartDataPoint[],
	brand: ChartSubject,
	isReportContext: boolean,
): number | null {
	if (isReportContext) return sovChartData ? (sovChartData[0][brand.id] as number) : null;
	const lastDataPoint = chartData.filter((point) => point[brand.id] !== null).pop();
	return lastDataPoint ? (lastDataPoint[brand.id] as number) : null;
}

function resolveBadgeClasses(badgeValue: number | null, isReportContext: boolean) {
	if (badgeValue === null) return null;
	if (isReportContext) return getSoVBadgeClasses(badgeValue);
	return {
		variant: getBadgeVariant(badgeValue) as "default" | "secondary" | "destructive",
		className: getBadgeClassName(badgeValue),
	};
}

/** Card chrome for the states that have no chart to draw. */
function PlaceholderCard({
	promptName,
	chartRef,
	isDownloading,
	onDownload,
	children,
}: {
	promptName: string;
	chartRef: RefObject<HTMLDivElement | null>;
	isDownloading: boolean;
	onDownload: () => void;
	children: ReactNode;
}) {
	return (
		<Card ref={chartRef} className="py-3 gap-3 print:shadow-none print:border">
			<CardHeader className="flex justify-between items-center px-3">
				<CardTitle className="text-sm print:text-xs">{promptName}</CardTitle>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="px-3">{children}</CardContent>
			<ChartDownloadFooter onDownload={onDownload} isDownloading={isDownloading} />
		</Card>
	);
}

export function PromptChartPrint({
	lookback = "1m",
	promptName,
	promptId,
	brand,
	competitors,
	promptRuns,
	hasEverBeenEvaluated = false,
	category,
}: PromptChartPrintProps) {
	const fileName = `${brand.name}-${promptName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
	const { chartRef, isDownloading, handleDownload } = useChartDownload(fileName);

	const promptSpecificRuns = promptRuns?.filter((run) => run.promptId === promptId) || [];

	const hasNoRuns = promptSpecificRuns.length === 0;

	// For report context: use SoV-based chart data. For dashboard: use visibility time-series.
	const isReportContext = !!category;
	const sovChartData = isReportContext ? computeSoVChartData(promptSpecificRuns, brand, competitors) : null;

	// Dashboard mode: time-series visibility
	const chartData = isReportContext
		? (sovChartData ?? [])
		: calculateVisibilityPercentages(promptSpecificRuns, brand, competitors, lookback);

	const selectedCompetitors = selectCompetitorsToDisplay(competitors, chartData, 5);

	const hasVisibilityData = hasAnyVisibility(chartData, [brand.id, ...selectedCompetitors.map((c) => c.id)]);
	const badgeValue = resolveBadgeValue(sovChartData, chartData, brand, isReportContext);
	const badgeLabel = isReportContext ? "SoV" : "Visibility";
	const placeholderProps = { promptName, chartRef, isDownloading, onDownload: handleDownload };

	if (hasNoRuns) {
		const message = hasEverBeenEvaluated ? "No data in selected time range" : "Evaluating for the first time...";

		return (
			<PlaceholderCard {...placeholderProps}>
				<div>
					<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground print:text-lg">
						{message}
					</span>
				</div>
			</PlaceholderCard>
		);
	}

	if (!hasVisibilityData) {
		return (
			<PlaceholderCard {...placeholderProps}>
				<div className="h-[250px] flex items-center justify-center">
					<div className="flex flex-col items-center text-center max-w-xs">
						<p className="text-sm font-medium text-muted-foreground print:text-xs">No brands found in responses</p>
						<p className="text-xs text-muted-foreground/70 mt-1 print:text-[10px]">
							Your brand and competitors weren't mentioned in the evaluated responses for this prompt.
						</p>
					</div>
				</div>
			</PlaceholderCard>
		);
	}

	const badgeClasses = resolveBadgeClasses(badgeValue, isReportContext);

	return (
		<Card ref={chartRef} className="py-3 gap-3 print:shadow-none print:border print:break-inside-avoid">
			<CardHeader className="flex justify-between items-center px-3">
				<CardTitle className="text-sm print:text-xs">{promptName}</CardTitle>
				<div className="flex items-center gap-2">
					{badgeClasses && badgeValue !== null && (
						<Badge variant={badgeClasses.variant} className={`${badgeClasses.className} print:text-xs`}>
							{badgeValue}% {badgeLabel}
						</Badge>
					)}
				</div>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="p-0">
				<BaseChartPrint data={chartData} brand={brand} competitors={selectedCompetitors} />
			</CardContent>
			<ChartDownloadFooter onDownload={handleDownload} isDownloading={isDownloading} />
		</Card>
	);
}
