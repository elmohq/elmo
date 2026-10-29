import type { Competitor } from "@workspace/lib/db/schema";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
	type ChartSubject,
	generateDateRange,
	latestVisibility,
	type ProcessedBatchChartDataPoint,
} from "@/lib/chart-utils";

// Chart data for a single prompt (pre-processed for rendering)
export interface ProcessedChartData {
	chartData: Array<{
		date: string;
		[key: string]: number | string | null;
	}>;
	totalRuns: number;
	hasVisibilityData: boolean;
	lastBrandVisibility: number | null;
}

// Context value
interface ChartDataContextValue {
	batchData: ProcessedBatchChartDataPoint[] | null;
	brand: ChartSubject | null;
	competitors: Competitor[];
	dateRange: string[];
	getChartDataForPrompt: (promptId: string) => ProcessedChartData | null;
	isLoading: boolean;
}

const ChartDataContext = createContext<ChartDataContextValue | null>(null);

interface ChartDataProviderProps {
	children: ReactNode;
	batchData: ProcessedBatchChartDataPoint[] | null;
	brand: ChartSubject | null;
	competitors: Competitor[];
	startDate: Date;
	endDate: Date;
	isLoading: boolean;
}

const WEEKLY_AFTER_DAYS = 92;

/** Consecutive days grouped into Monday-to-Sunday weeks, each labelled by its first day in range. */
function weeks(days: string[]): string[][] {
	const groups: string[][] = [];
	for (const day of days) {
		const monday = new Date(`${day}T00:00:00Z`).getUTCDay() === 1;
		if (groups.length === 0 || monday) groups.push([day]);
		else groups[groups.length - 1].push(day);
	}
	return groups;
}

export function ChartDataProvider({
	children,
	batchData,
	brand,
	competitors,
	startDate,
	endDate,
	isLoading,
}: ChartDataProviderProps) {
	const dateRange = useMemo(() => {
		return generateDateRange(startDate, endDate);
	}, [startDate, endDate]);

	const sortedCompetitors = useMemo(() => {
		return [...competitors].sort((a, b) => a.name.localeCompare(b.name));
	}, [competitors]);

	// Index batch data by prompt_id for O(1) lookup
	const dataByPrompt = useMemo(() => {
		if (!batchData) return new Map<string, ProcessedBatchChartDataPoint[]>();

		const map = new Map<string, ProcessedBatchChartDataPoint[]>();
		for (const point of batchData) {
			const existing = map.get(point.prompt_id) || [];
			existing.push(point);
			map.set(point.prompt_id, existing);
		}
		return map;
	}, [batchData]);

	const getChartDataForPrompt = useMemo(() => {
		return (promptId: string): ProcessedChartData | null => {
			if (!brand || !batchData) return null;

			const promptData = dataByPrompt.get(promptId) || [];

			const dailyStatsMap = new Map<string, ProcessedBatchChartDataPoint>();
			for (const stat of promptData) {
				dailyStatsMap.set(String(stat.date), stat);
			}

			// Past three months a point per week: a year of daily points per prompt is more than a chart can show.
			const periods = dateRange.length > WEEKLY_AFTER_DAYS ? weeks(dateRange) : dateRange.map((date) => [date]);
			const chartData: Array<{ date: string; [key: string]: number | string | null }> = periods.map((days) => {
				let totalRuns = 0;
				let brandMentions = 0;
				const competitorMentions = new Map<string, number>();
				for (const day of days) {
					const dayStat = dailyStatsMap.get(day);
					if (!dayStat) continue;
					totalRuns += Number(dayStat.total_runs);
					brandMentions += Number(dayStat.brand_mentioned_count);
					for (const [name, count] of Object.entries(dayStat.competitor_counts || {})) {
						competitorMentions.set(name, (competitorMentions.get(name) ?? 0) + Number(count));
					}
				}

				const dataPoint: { date: string; [key: string]: number | string | null } = { date: days[0] };

				if (totalRuns === 0) {
					dataPoint[brand.id] = null;
					sortedCompetitors.forEach((competitor) => {
						dataPoint[competitor.id] = null;
					});
					return dataPoint;
				}

				dataPoint[brand.id] = Math.round((brandMentions / totalRuns) * 100);
				sortedCompetitors.forEach((competitor) => {
					dataPoint[competitor.id] = Math.round(((competitorMentions.get(competitor.name) ?? 0) / totalRuns) * 100);
				});

				return dataPoint;
			});

			const totalRuns = promptData.reduce((sum, s) => sum + Number(s.total_runs), 0);

			const hasVisibilityData = chartData.some((dataPoint) => {
				const allIds = [brand.id, ...sortedCompetitors.map((c) => c.id)];
				return allIds.some((id) => {
					const visibility = dataPoint[id];
					return visibility !== null && visibility !== undefined && Number(visibility) > 0;
				});
			});

			const lastBrandVisibility = latestVisibility(chartData, brand.id);

			return {
				chartData,
				totalRuns,
				hasVisibilityData,
				lastBrandVisibility,
			};
		};
	}, [brand, batchData, dataByPrompt, dateRange, sortedCompetitors]);

	const value: ChartDataContextValue = {
		batchData,
		brand,
		competitors: sortedCompetitors,
		dateRange,
		getChartDataForPrompt,
		isLoading,
	};

	return <ChartDataContext.Provider value={value}>{children}</ChartDataContext.Provider>;
}

export function useOptionalChartDataContext() {
	return useContext(ChartDataContext);
}
